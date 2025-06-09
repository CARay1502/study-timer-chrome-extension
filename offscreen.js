// offscreen.js handles the audio playback (offscreen.html call) when timer session completed
// Loop for playing sound several times
let soundLoopCount = 0;
let maxSoundLoops = 3; //plays 3 times change if needed
let soundLoopTimeout = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'playCompletionSound') {
        const loops = message.loops || 3;
        playCompletionSoundLoop(loops);
        sendResponse({ success: true });
    } else if (message.action === 'stopCompletionSound') {
        stopCompletionSound();
        sendResponse({ success: true });
    }
});

function playCompletionSoundLoop(totalLoops) {
    maxSoundLoops = totalLoops;
    soundLoopCount = 0;
    playNextSound();
}

function playNextSound() {
    if (soundLoopCount >= maxSoundLoops) {
        return;
    }

    const audio = document.getElementById('completionSound');
    if (audio) {
        audio.currentTime = 0;

        const onEnded = () => {
            audio.removeEventListener('ended', onEnded);
            soundLoopCount++;

            // STupid over engineered time pause between plays
            soundLoopTimeout = setTimeout(() => {
                playNextSound();
            }, 500);
        };

        audio.addEventListener('ended', onEnded);

        audio.play().catch(error => {
            console.error('Error playing completion sound: ', error);
        });
    }
}

function stopCompletionSound() {
    if (soundLoopTimeout) {
        clearTimeout(soundLoopTimeout);
        soundLoopTimeout = null;
    }

    const audio = document.getElementById('completionSound');
    if (audio) {
        audio.pause();
        audio.currentTime = 0;
    }
    soundLoopCount = maxSoundLoops;
}