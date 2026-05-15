/**
 * Stabilization State Sub-Feature
 * Design Intent: Manages content fingerprinting and stabilization 
 * flags to keep StateManager under 100 lines.
 */
const stabilizationState = {
    lastContentFP: '',
    lastTextHash: '',
    _lastStabilizeFP: '',
    _stabilizeReady: false,

    setLastContentFP(fp) { this.lastContentFP = fp; },
    getLastContentFP() { return this.lastContentFP; },

    setLastTextHash(hash) { this.lastTextHash = hash; },
    getLastTextHash() { return this.lastTextHash; },

    setStabilizeFP(fp) { this._lastStabilizeFP = fp; },
    getStabilizeFP() { return this._lastStabilizeFP; },

    setStabilizeReady(ready) { this._stabilizeReady = ready; },
    getStabilizeReady() { return this._stabilizeReady; },

    reset() {
        this.lastContentFP = '';
        this.lastTextHash = '';
        this._lastStabilizeFP = '';
        this._stabilizeReady = false;
    }
};
export default stabilizationState;