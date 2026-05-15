"use strict";(()=>{var n=class{constructor(){this.isOpen=!1,this.mount()}mount(){let t=document.createElement("div");t.id="vst-mobile-fab",t.innerHTML=`
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                <path d="M12 5v14M5 12h14"/>
            </svg>
        `,t.onclick=()=>this.toggle(),document.body.appendChild(t);let e=document.createElement("div");e.id="vst-mobile-drawer",e.innerHTML=`
            <div class="vst-drawer-header">
                <h2>Pilot Pro Mobile</h2>
                <button id="vst-close-drawer">\u2715</button>
            </div>
            <div class="vst-drawer-content">
                <div id="vst-mobile-controls" style="display: flex; gap: 10px; margin-bottom: 20px;">
                     <button class="btn-primary" id="vst-mob-run">Run</button>
                     <button class="btn-secondary" id="vst-mob-pick">Pick</button>
                     <button class="btn-danger" id="vst-mob-stop">Stop</button>
                </div>
                <div id="vst-mobile-status">Ready</div>
            </div>
        `,document.body.appendChild(e),document.getElementById("vst-mob-run").onclick=()=>{this.updateStatus("Starting..."),window.dispatchEvent(new CustomEvent("vst-command",{detail:{action:"START_FULL_RIP"}}))},document.getElementById("vst-mob-pick").onclick=()=>{this.updateStatus("Pick element..."),window.dispatchEvent(new CustomEvent("vst-command",{detail:{action:"PICK"}})),this.close()},document.getElementById("vst-mob-stop").onclick=()=>{this.updateStatus("Stopping..."),window.dispatchEvent(new CustomEvent("vst-command",{detail:{action:"STOP_RIP"}}))},document.getElementById("vst-close-drawer").onclick=()=>this.close()}updateStatus(t){let e=document.getElementById("vst-mobile-status");e&&(e.textContent=t)}toggle(){this.isOpen?this.close():this.open()}open(){this.isOpen=!0,document.getElementById("vst-mobile-drawer").classList.add("open")}close(){this.isOpen=!1,document.getElementById("vst-mobile-drawer").classList.remove("open")}};navigator.userAgent.toLowerCase().includes("android")&&new n;})();
