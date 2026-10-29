// Built-in cues stay local. Speech uses only voices marked local by Chromium.
export function createTimerAlerts({ AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext,
    speech = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance } = {}) {
    let context, disposed = false;
    const seen = new Set();
    const tones = {Chime:[660,880],Tick:[1000],Bell:[880,660,440],Alert:[880,440,880],Falling:[880,660,440,220]};
    function blip() {
        if(disposed || !AudioContext)return;
        try {context ||= new AudioContext();void context.resume();const oscillator=context.createOscillator(),gain=context.createGain(),at=context.currentTime;
            oscillator.frequency.value=540;gain.gain.setValueAtTime(.045,at);gain.gain.exponentialRampToValueAtTime(.001,at+.09);
            oscillator.connect(gain);gain.connect(context.destination);oscillator.start(at);oscillator.stop(at+.1);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};} catch {}
    }
    return { blip, play(cues = []) {
        for (const cue of cues) {
            if (disposed || seen.has(cue.id)) continue;
            seen.add(cue.id); if (seen.size > 500) seen.delete(seen.values().next().value);
            const volume = Math.max(0,Math.min(1,Number(cue.volume)/100 || 0));
            if (!volume) continue;
            if (cue.action === 'speak' && speech && Utterance) {
                const voices = speech.getVoices().filter(voice => voice.localService);
                if (!voices.length) continue;
                const utterance = new Utterance(String(cue.text || '').slice(0,300));
                utterance.voice = voices.find(voice => voice.default) || voices[0]; utterance.volume = volume;
                speech.speak(utterance);
            } else if (cue.action === 'sound' && AudioContext) {
                try {
                    context ||= new AudioContext(); void context.resume();
                    (tones[cue.sound] || tones.Chime).forEach((frequency,index) => {
                        const oscillator = context.createOscillator(), gain = context.createGain();
                        const at = context.currentTime + index*.12;
                        oscillator.type='sine';oscillator.frequency.value=frequency;
                        gain.gain.setValueAtTime(volume*.15,at);gain.gain.exponentialRampToValueAtTime(.001,at+.18);
                        oscillator.connect(gain);gain.connect(context.destination);oscillator.start(at);oscillator.stop(at+.2);
                        oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
                    });
                } catch { /* Audio device changes cannot interrupt parsing. */ }
            }
        }
    }, stop(){speech?.cancel();void context?.close();context=null;}, dispose() { disposed=true; speech?.cancel(); void context?.close(); } };
}
