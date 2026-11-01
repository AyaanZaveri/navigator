import AVFAudio
import UIKit
import WebKit

@MainActor final class WeakScriptHandler: NSObject, WKScriptMessageHandler {
  weak var owner: NavigatorViewController?
  init(_ owner: NavigatorViewController) { self.owner = owner }
  func userContentController(
    _ controller: WKUserContentController, didReceive message: WKScriptMessage
  ) { owner?.receive(message) }
}
@MainActor final class NavigatorViewController: UIViewController, WKNavigationDelegate, WKUIDelegate
{
  private let playback = PlaybackAdapter()
  private var web: WKWebView!
  private var origin: TrustedOrigin!
  private var visible = false, fullscreen = false, closed = false
  private var backGesture: UIScreenEdgePanGestureRecognizer?
  private var previousOrientation: UIInterfaceOrientationMask = .portrait
  private var loading: UIView?
  private var timeout: Task<Void, Never>?
  private var observations: [NSObjectProtocol] = []
  private var pageGeneration = UUID()
  override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .all }
  override var prefersStatusBarHidden: Bool { fullscreen }
  override var prefersHomeIndicatorAutoHidden: Bool { fullscreen }
  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = UIColor(red: 0.03, green: 0.08, blue: 0.07, alpha: 1)
    origin =
      (try? TrustedOrigin(
        UserDefaults.standard.string(forKey: "server") ?? "https://navigator-strm.vercel.app"))
      ?? (try! TrustedOrigin("https://navigator-strm.vercel.app"))
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .default()
    config.allowsInlineMediaPlayback = true
    config.allowsPictureInPictureMediaPlayback = false
    config.userContentController.add(WeakScriptHandler(self), name: "navigator")
    // VLC snapshots need a window-backed drawable. Keep the one preview
    // decoder behind the opaque playback surface, never in the WebView.
    let previewSurface = playback.previews.surface
    previewSurface.isUserInteractionEnabled = false
    view.addSubview(previewSurface)
    web = WKWebView(frame: .zero, configuration: config)
    web.navigationDelegate = self
    web.uiDelegate = self
    web.allowsBackForwardNavigationGestures = true
    web.scrollView.contentInsetAdjustmentBehavior = .never
    for child in [playback.engine.surface, playback.startupCover, web!] {
      child.translatesAutoresizingMaskIntoConstraints = false
      view.addSubview(child)
      NSLayoutConstraint.activate([
        child.leadingAnchor.constraint(equalTo: view.leadingAnchor),
        child.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        child.topAnchor.constraint(equalTo: view.topAnchor),
        child.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      ])
    }
    playback.emit = { [weak self] message in self?.send(message) }
    let back = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(backSwipe(_:)))
    back.edges = .left
    back.isEnabled = false
    view.addGestureRecognizer(back)
    backGesture = back
    web.scrollView.keyboardDismissMode = .interactive
    observeAudio()
    loadServer()
  }
  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    playback.layout()
  }
  private func observeAudio() {
    observations.append(
      NotificationCenter.default.addObserver(
        forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
      ) { [weak self] note in
        let began =
          (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt)
          == AVAudioSession.InterruptionType.began.rawValue
        if began { Task { @MainActor in self?.playback.pause() } }
      })
    observations.append(
      NotificationCenter.default.addObserver(
        forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main
      ) { [weak self] note in
        let removed =
          (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt)
          == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue
        if removed { Task { @MainActor in self?.playback.pause() } }
      })
  }
  private func loadServer() {
    playback.stop()
    setVisible(false)
    showLoading()
    pageGeneration = UUID()
    let content = web.configuration.userContentController
    content.removeAllUserScripts()
    guard let js = Bundle.main.url(forResource: "bridge", withExtension: "js"),
      let css = Bundle.main.url(forResource: "native", withExtension: "css"),
      let source = try? String(contentsOf: js, encoding: .utf8),
      let styles = try? String(contentsOf: css, encoding: .utf8),
      let originJSON = try? JSONSerialization.data(
        withJSONObject: origin.url.absoluteString.trimmingCharacters(
          in: CharacterSet(charactersIn: "/")), options: .fragmentsAllowed),
      let styleJSON = try? JSONSerialization.data(
        withJSONObject: styles, options: .fragmentsAllowed)
    else {
      showFailure("The app bridge is missing. Reinstall Navigator.")
      return
    }
    let script = source.replacingOccurrences(
      of: "__NAVIGATOR_ORIGIN__", with: String(decoding: originJSON, as: UTF8.self)
    ).replacingOccurrences(
      of: "__NAVIGATOR_STYLES__", with: String(decoding: styleJSON, as: UTF8.self))
    content.addUserScript(
      WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    web.load(URLRequest(url: origin.url))
    let owner = pageGeneration
    timeout?.cancel()
    timeout = Task { [weak self] in
      try? await Task.sleep(for: .seconds(25))
      guard !Task.isCancelled, let self, self.pageGeneration == owner, self.loading != nil else {
        return
      }
      self.showFailure("Navigator did not load. Check your connection or server address.")
    }
  }
  func receive(_ message: WKScriptMessage) {
    let s = message.frameInfo.securityOrigin
    guard message.frameInfo.isMainFrame, s.protocol == "https",
      s.host.lowercased() == origin.url.host?.lowercased(),
      (s.port == 0 ? 443 : s.port) == (origin.url.port ?? 443), let url = web.url,
      origin.matches(url)
    else { return }
    do {
      let command = try BridgeCommand(message.body)
      #if DEBUG
        if command.type == "load" { NSLog("[DEBUG-IOS] accepted load") }
      #endif
      switch command.type {
      case "hello": send(["type": "fullscreen", "value": fullscreen])
      case "visible": if let value = command.body["value"] as? Bool { setVisible(value) }
      case "fullscreen": if let value = command.body["value"] as? Bool { setFullscreen(value) }
      case "settings": settings()
      case "seek-feedback":
        if command.session == playback.session { UISelectionFeedbackGenerator().selectionChanged() }
      default: try playback.handle(command)
      }
    } catch {
      if let body = message.body as? [String: Any], body["type"] as? String == "load",
        let session = body["session"] as? String
      {
        send([
          "type": "error", "session": session,
          "message": "This source requires a valid HTTPS URL and supported request headers.",
        ])
      }
    }
  }
  private func send(_ message: [String: Any]) {
    guard !closed, web != nil, web.url.map(origin.matches) == true else { return }
    web.callAsyncJavaScript(
      "if (!window.NavigatorIOS) throw new Error('Bridge missing'); window.NavigatorIOS.receive(message); return true;",
      arguments: ["message": message], in: nil, in: .page,
      completionHandler: { result in
        #if DEBUG
          if case .failure(let error) = result {
            NSLog("[DEBUG-IOS] event delivery failed: %@", String(describing: error))
          }
        #endif
      })
  }
  private func setVisible(_ value: Bool) {
    if value && !visible {
      previousOrientation =
        view.window?.windowScene?.interfaceOrientation.isLandscape == true ? .landscape : .portrait
    }
    visible = value
    backGesture?.isEnabled = value
    web.isOpaque = !value
    web.backgroundColor = value ? .clear : UIColor(white: 0.04, alpha: 1)
    web.scrollView.backgroundColor = web.backgroundColor
    if !value { playback.stop() }
    web.allowsBackForwardNavigationGestures = !value
    setFullscreen(value)
  }
  @objc private func backSwipe(_ gesture: UIScreenEdgePanGestureRecognizer) {
    guard gesture.state == .ended, visible else { return }
    if gesture.translation(in: view).x > view.bounds.width * 0.25
      || gesture.velocity(in: view).x > 650
    {
      send(["type": "close"])
    }
  }
  private func setFullscreen(_ value: Bool) {
    fullscreen = value
    setNeedsStatusBarAppearanceUpdate()
    setNeedsUpdateOfHomeIndicatorAutoHidden()
    if UIDevice.current.userInterfaceIdiom == .phone {
      view.window?.windowScene?.requestGeometryUpdate(
        .iOS(interfaceOrientations: value ? .landscape : previousOrientation)
      ) { _ in }
    }
    send(["type": "fullscreen", "value": value])
  }
  private func showLoading() {
    loading?.removeFromSuperview()
    let pane = UIView()
    pane.backgroundColor = UIColor(red: 0.03, green: 0.11, blue: 0.10, alpha: 1)
    pane.translatesAutoresizingMaskIntoConstraints = false
    let stack = UIStackView()
    stack.axis = .vertical
    stack.alignment = .center
    stack.spacing = 20
    stack.translatesAutoresizingMaskIntoConstraints = false
    let mark = UIImageView(image: UIImage(named: "LaunchMark"))
    mark.tintColor = UIColor(red: 0.37, green: 0.92, blue: 0.83, alpha: 1)
    mark.contentMode = .scaleAspectFit
    mark.widthAnchor.constraint(equalToConstant: 72).isActive = true
    mark.heightAnchor.constraint(equalToConstant: 72).isActive = true
    let indicator = UIActivityIndicatorView(style: .medium)
    indicator.startAnimating()
    indicator.color = .white
    stack.addArrangedSubview(mark)
    stack.addArrangedSubview(indicator)
    pane.addSubview(stack)
    view.addSubview(pane)
    NSLayoutConstraint.activate([
      pane.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      pane.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      pane.topAnchor.constraint(equalTo: view.topAnchor),
      pane.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      stack.centerXAnchor.constraint(equalTo: pane.centerXAnchor),
      stack.centerYAnchor.constraint(equalTo: pane.centerYAnchor),
    ])
    loading = pane
  }
  private func showFailure(_ message: String) {
    playback.stop()
    setVisible(false)
    timeout?.cancel()
    loading?.removeFromSuperview()
    loading = nil
    let pane = UIView()
    pane.translatesAutoresizingMaskIntoConstraints = false
    pane.backgroundColor = UIColor(red: 0.03, green: 0.11, blue: 0.10, alpha: 1)
    let stack = UIStackView()
    stack.axis = .vertical
    stack.alignment = .center
    stack.spacing = 20
    stack.translatesAutoresizingMaskIntoConstraints = false
    let label = UILabel()
    label.text = message
    label.textColor = .white
    label.font = .preferredFont(forTextStyle: .body)
    label.adjustsFontForContentSizeCategory = true
    label.numberOfLines = 0
    label.textAlignment = .center
    let retry = UIButton(type: .system)
    retry.setTitle("Retry", for: .normal)
    retry.addAction(UIAction { [weak self] _ in self?.loadServer() }, for: .touchUpInside)
    let settings = UIButton(type: .system)
    settings.setTitle("Server settings", for: .normal)
    settings.addAction(UIAction { [weak self] _ in self?.settings() }, for: .touchUpInside)
    [label, retry, settings].forEach(stack.addArrangedSubview)
    pane.addSubview(stack)
    view.addSubview(pane)
    NSLayoutConstraint.activate([
      pane.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      pane.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      pane.topAnchor.constraint(equalTo: view.topAnchor),
      pane.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      stack.leadingAnchor.constraint(equalTo: pane.safeAreaLayoutGuide.leadingAnchor, constant: 24),
      stack.trailingAnchor.constraint(
        equalTo: pane.safeAreaLayoutGuide.trailingAnchor, constant: -24),
      stack.centerYAnchor.constraint(equalTo: pane.centerYAnchor),
    ])
    loading = pane
  }

  private func settings() {
    let alert = UIAlertController(
      title: "Navigator server", message: "Enter the HTTPS origin of your Navigator server.",
      preferredStyle: .alert)
    alert.addTextField {
      $0.text = self.origin.url.absoluteString
      $0.keyboardType = .URL
      $0.autocapitalizationType = .none
      $0.autocorrectionType = .no
    }
    alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
    alert.addAction(
      UIAlertAction(title: "Save", style: .default) { [weak self, weak alert] _ in
        guard let self else { return }
        do {
          let origin = try TrustedOrigin(alert?.textFields?.first?.text ?? "")
          self.origin = origin
          UserDefaults.standard.set(origin.url.absoluteString, forKey: "server")
          self.loadServer()
        } catch { self.showFailure("Use an HTTPS origin without a path, query, or credentials.") }
      })
    present(alert, animated: true)
  }
  func webView(
    _ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
    decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
  ) {
    guard let url = action.request.url else {
      decisionHandler(.cancel)
      return
    }
    if origin.matches(url)
      || (action.targetFrame?.isMainFrame == false && url.scheme?.lowercased() == "https")
    {
      decisionHandler(.allow)
    } else {
      if action.targetFrame?.isMainFrame != false,
        ["https", "http"].contains(url.scheme?.lowercased() ?? "")
      {
        UIApplication.shared.open(url)
      }
      decisionHandler(.cancel)
    }
  }
  func webView(
    _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
    for action: WKNavigationAction, windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    if let url = action.request.url, ["https", "http"].contains(url.scheme?.lowercased() ?? "") {
      UIApplication.shared.open(url)
    }
    return nil
  }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    guard webView.url.map(origin.matches) == true else { return }
    timeout?.cancel()
    loading?.removeFromSuperview()
    loading = nil
  }
  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    if (error as NSError).code != NSURLErrorCancelled {
      showFailure("Check your connection and try again.")
    }
  }
  func webView(
    _ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) {
    if (error as NSError).code != NSURLErrorCancelled {
      showFailure("Check your connection and HTTPS server address.")
    }
  }
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    playback.stop()
    loadServer()
  }
  func suspend() {
    send(["type": "suspend"])
    playback.suspend()
  }
  func resume() { playback.resumeRendering() }
  func close() {
    closed = true
    timeout?.cancel()
    observations.forEach(NotificationCenter.default.removeObserver)
    observations = []
    playback.close()
    web?.configuration.userContentController.removeScriptMessageHandler(forName: "navigator")
    web?.stopLoading()
  }
}
