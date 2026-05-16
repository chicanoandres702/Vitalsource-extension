/**
 * Stability Poller Strategy
 * Polls until content is valid and unchanged for several rounds.
 */
export async function pollForStability(
    getRawText,
    isInvalid,
    delay,
    maxPolls = 200,
    stableRoundsNeeded = 3,
    isRunning = () => true
) {
    let stableRounds = 0;
    let lastSeen = '';

    for (let attempt = 0; attempt < maxPolls && isRunning(); attempt++) {
        const text = getRawText();
        if (isInvalid(text)) {
            stableRounds = 0;
            lastSeen = '';
            await delay();
            continue;
        }

        if (text === lastSeen) {
            stableRounds++;
            if (stableRounds >= stableRoundsNeeded) {
                return text;
            }
        } else {
            stableRounds = 1;
            lastSeen = text;
        }
        await delay();
    }
    return null;
}
