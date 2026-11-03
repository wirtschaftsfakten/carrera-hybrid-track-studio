import UIKit
import Capacitor

/// Registers the plugins that live in this app target. Capacitor only
/// registers plugins from npm packages automatically.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(StorePlugin())
    }
}
