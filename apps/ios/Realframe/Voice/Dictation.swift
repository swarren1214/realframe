import AVFoundation
import Speech

/// Talk instead of type, with Apple's speech recognition. Runs on the device when it can, so
/// audio never leaves the phone; otherwise Apple's speech service transcribes it. Realframe only
/// ever receives the words. A pause of 1.5 s ends dictation.
@MainActor
@Observable
final class Dictation {
    private(set) var listening = false
    private(set) var partial = ""
    private(set) var onDevice = false
    var error: String?

    private let engine = AVAudioEngine()
    private let recognizer = SFSpeechRecognizer()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var tapped = false
    private var silence: Task<Void, Never>?
    private var onFinal: ((String) -> Void)?

    func toggle(onFinal: @escaping (String) -> Void) async {
        if listening { stop() } else { await start(onFinal: onFinal) }
    }

    func start(onFinal: @escaping (String) -> Void) async {
        error = nil
        guard let recognizer, recognizer.isAvailable else {
            error = "Speech recognition isn't available right now."
            return
        }
        let auth = await withCheckedContinuation { (c: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>) in
            SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0) }
        }
        guard auth == .authorized else {
            error = "Allow Speech Recognition for Realframe in Settings to talk instead of type."
            return
        }
        guard await AVAudioApplication.requestRecordPermission() else {
            error = "Allow the microphone for Realframe in Settings to talk instead of type."
            return
        }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            onDevice = recognizer.supportsOnDeviceRecognition
            request.requiresOnDeviceRecognition = onDevice
            self.request = request
            self.onFinal = onFinal

            let input = engine.inputNode
            input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in
                request.append(buffer)
            }
            tapped = true
            engine.prepare()
            try engine.start()
            listening = true
            partial = ""
            armSilence(seconds: 8)

            task = recognizer.recognitionTask(with: request) { [weak self] result, err in
                let text = result?.bestTranscription.formattedString
                let done = result?.isFinal ?? false
                Task { @MainActor in
                    guard let self else { return }
                    if let text {
                        self.partial = text
                        self.armSilence(seconds: 1.5)
                    }
                    if done || err != nil { self.finish() }
                }
            }
        } catch {
            self.error = "Voice input couldn't start. Try again."
            finish()
        }
    }

    /// Stops listening; the final result arrives and is handed over.
    func stop() {
        silence?.cancel()
        if tapped {
            engine.inputNode.removeTap(onBus: 0)
            tapped = false
        }
        engine.stop()
        request?.endAudio()
    }

    /// Stops without keeping anything.
    func cancel() {
        onFinal = nil
        task?.cancel()
        finish()
    }

    private func armSilence(seconds: Double) {
        silence?.cancel()
        silence = Task { [weak self] in
            try? await Task.sleep(for: .seconds(seconds))
            guard !Task.isCancelled else { return }
            self?.stop()
        }
    }

    private func finish() {
        guard listening || request != nil else { return }
        silence?.cancel()
        if tapped {
            engine.inputNode.removeTap(onBus: 0)
            tapped = false
        }
        engine.stop()
        let text = partial.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.isEmpty { onFinal?(text) }
        onFinal = nil
        request = nil
        task = nil
        listening = false
        partial = ""
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

/// Adds dictated text to what's typed, and spots the one spoken command: "send".
enum Spoken {
    static func isSend(_ text: String) -> Bool {
        let t = text.lowercased().trimmingCharacters(in: .punctuationCharacters.union(.whitespaces))
        return t == "send" || t == "send it"
    }

    static func append(_ current: String, _ spoken: String) -> String {
        let add = spoken.trimmingCharacters(in: .whitespaces)
        guard !add.isEmpty else { return current }
        let base = current.trimmingCharacters(in: .whitespacesAndNewlines)
        if base.isEmpty { return add.prefix(1).uppercased() + add.dropFirst() }
        return base + " " + add
    }
}
