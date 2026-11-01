import UIKit

@main final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application:UIApplication,configurationForConnecting session:UISceneSession,options:UIScene.ConnectionOptions)->UISceneConfiguration {
        let config=UISceneConfiguration(name:"Navigator",sessionRole:session.role)
        config.delegateClass=SceneDelegate.self
        return config
    }
}
@MainActor final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window:UIWindow?
    func scene(_ scene:UIScene,willConnectTo session:UISceneSession,options:UIScene.ConnectionOptions) {
        guard let scene=scene as? UIWindowScene else { return }
        let window=UIWindow(windowScene:scene);window.rootViewController=NavigatorViewController()
        self.window=window;window.makeKeyAndVisible()
    }
    func sceneWillResignActive(_ scene:UIScene) { (window?.rootViewController as? NavigatorViewController)?.suspend() }
    func sceneDidBecomeActive(_ scene:UIScene) { (window?.rootViewController as? NavigatorViewController)?.resume() }
    func sceneDidDisconnect(_ scene:UIScene) { (window?.rootViewController as? NavigatorViewController)?.close() }
}
