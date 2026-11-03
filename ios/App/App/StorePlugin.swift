import Foundation
import Capacitor
import StoreKit

/// StoreKit 2 bridge for the Pro subscriptions (JS name "TrackStudioStore",
/// see src/billing/native.ts). The app never decides about Pro on its own:
/// every signed transaction (JWS) is sent to the server, which verifies the
/// Apple certificate chain and returns a signed entitlement.
@objc(StorePlugin)
public class StorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StorePlugin"
    public let jsName = "TrackStudioStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manageSubscriptions", returnType: CAPPluginReturnPromise),
    ]

    private var updates: Task<Void, Never>?

    override public func load() {
        // Renewals, Ask to Buy approvals and purchases from other devices
        // arrive here. They must be finished; the server learns about them
        // through App Store Server Notifications.
        updates = Task.detached {
            for await result in Transaction.updates {
                if case .verified(let transaction) = result {
                    await transaction.finish()
                }
            }
        }
    }

    deinit {
        updates?.cancel()
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        let ids = call.getArray("ids", String.self) ?? []
        Task {
            do {
                let products = try await Product.products(for: ids)
                call.resolve([
                    "products": products.map { product in
                        [
                            "id": product.id,
                            "displayName": product.displayName,
                            "displayPrice": product.displayPrice,
                            "period": product.subscription.map { Self.describe($0.subscriptionPeriod) } ?? "",
                        ]
                    },
                ])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("Produkt-ID fehlt")
            return
        }
        let accountToken = call.getString("appAccountToken").flatMap(UUID.init(uuidString:))
        Task {
            do {
                guard let product = try await Product.products(for: [id]).first else {
                    call.reject("Produkt nicht gefunden")
                    return
                }
                var options: Set<Product.PurchaseOption> = []
                if let accountToken { options.insert(.appAccountToken(accountToken)) }
                switch try await product.purchase(options: options) {
                case .success(let verification):
                    if case .verified(let transaction) = verification {
                        await transaction.finish()
                    }
                    call.resolve(["status": "purchased", "signedTransaction": verification.jwsRepresentation])
                case .pending:
                    call.resolve(["status": "pending"])
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                @unknown default:
                    call.resolve(["status": "cancelled"])
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// Restore purchases: syncs with the App Store and returns the current
    /// subscription transactions of this Apple ID.
    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                var signed: [String] = []
                for await result in Transaction.currentEntitlements {
                    if case .verified(let transaction) = result, transaction.productType == .autoRenewable {
                        signed.append(result.jwsRepresentation)
                    }
                }
                call.resolve(["signedTransactions": signed])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func manageSubscriptions(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let scene = self.bridge?.viewController?.view.window?.windowScene else {
                call.reject("Fenster nicht verfügbar")
                return
            }
            do {
                try await AppStore.showManageSubscriptions(in: scene)
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    private static func describe(_ period: Product.SubscriptionPeriod) -> String {
        switch period.unit {
        case .day: return "\(period.value) day"
        case .week: return "\(period.value) week"
        case .month: return "\(period.value) month"
        case .year: return "\(period.value) year"
        @unknown default: return "\(period.value)"
        }
    }
}
