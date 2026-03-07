import { useCallback, useRef, useState, useEffect } from 'react';

interface UseTextToSpeechOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  language?: string;
}

export function useTextToSpeech(options: UseTextToSpeechOptions = {}) {
  const {
    rate = 1,
    pitch = 1,
    volume = 1,
    language = 'en-GB',
  } = options;

  const synthRef = useRef<SpeechSynthesis | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const [isSpeakingState, setIsSpeaking] = useState(false);

  // Initialize speech synthesis and find British female voice
  useEffect(() => {
    if (typeof window !== 'undefined' && !synthRef.current) {
      synthRef.current = window.speechSynthesis;

      // Load voices
      const loadVoices = () => {
        const voices = synthRef.current?.getVoices() || [];

        // Try to find a British female voice
        let britishFemale = voices.find(
          (voice) => voice.lang.includes('en-GB') && voice.name.toLowerCase().includes('female')
        );

        // Fallback: any British voice
        if (!britishFemale) {
          britishFemale = voices.find((voice) => voice.lang.includes('en-GB'));
        }

        // Fallback: any female voice
        if (!britishFemale) {
          britishFemale = voices.find((voice) => voice.name.toLowerCase().includes('female'));
        }

        // Fallback: just use first available voice
        if (!britishFemale && voices.length > 0) {
          britishFemale = voices[0];
        }

        voiceRef.current = britishFemale || null;
      };

      loadVoices();
      synthRef.current.onvoiceschanged = loadVoices;
    }
  }, []);

  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      if (!synthRef.current) return;

      // Cancel any ongoing speech
      synthRef.current.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = volume;
      utterance.lang = language;

      if (voiceRef.current) {
        utterance.voice = voiceRef.current;
      }

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        onEnd?.();
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        onEnd?.();
      };

      synthRef.current.speak(utterance);
    },
    [rate, pitch, volume, language]
  );

  const stop = useCallback(() => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsSpeaking(false);
    }
  }, []);

  const isSpeaking = useCallback(
    () => isSpeakingState || (synthRef.current?.speaking ?? false),
    [isSpeakingState]
  );

  return { speak, stop, isSpeaking };
}
