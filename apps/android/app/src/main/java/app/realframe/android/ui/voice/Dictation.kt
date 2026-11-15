package app.realframe.android.ui.voice

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

/**
 * Talk instead of type, with Android's speech recognition. Uses the on-device recognizer when
 * the phone has one (Android 12+), otherwise the system recognizer, asking it to stay offline.
 * Realframe only ever receives the words. Call from the main thread.
 */
class Dictation(
    private val context: Context,
    private val onPartial: (String) -> Unit,
    private val onFinal: (String) -> Unit,
    private val onEnd: (error: String?) -> Unit,
) {
    private var recognizer: SpeechRecognizer? = null
    var onDevice = false
        private set

    val available: Boolean
        get() = SpeechRecognizer.isRecognitionAvailable(context) ||
            (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(context))

    fun start() {
        if (recognizer != null) return
        onDevice = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
        val r = if (onDevice && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
        } else {
            SpeechRecognizer.createSpeechRecognizer(context)
        }
        recognizer = r
        r.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onEvent(eventType: Int, params: Bundle?) {}

            override fun onPartialResults(partialResults: Bundle?) {
                partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()?.let(onPartial)
            }

            override fun onResults(results: Bundle?) {
                results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()?.takeIf { it.isNotBlank() }?.let(onFinal)
                finish(null)
            }

            override fun onError(error: Int) {
                finish(
                    when (error) {
                        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> null
                        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Allow the microphone for Realframe in Settings."
                        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "The speech service couldn't be reached."
                        else -> "Voice input stopped. Try again."
                    },
                )
            }
        })
        r.startListening(
            Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L)
            },
        )
    }

    /** Stops listening; the final result still arrives. */
    fun stop() {
        recognizer?.stopListening()
    }

    /** Stops without keeping anything. */
    fun cancel() {
        recognizer?.cancel()
        finish(null)
    }

    private fun finish(error: String?) {
        val r = recognizer ?: return
        recognizer = null
        r.destroy()
        onEnd(error)
    }

    companion object {
        fun isSend(text: String): Boolean {
            val t = text.lowercase().trim().trimEnd('.', '!', '?')
            return t == "send" || t == "send it"
        }

        fun append(current: String, spoken: String): String {
            val add = spoken.trim()
            if (add.isEmpty()) return current
            val base = current.trimEnd()
            if (base.isEmpty()) return add.replaceFirstChar { it.uppercase() }
            return "$base $add"
        }
    }
}
