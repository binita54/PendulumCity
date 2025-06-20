var whatIsThis = false;

const canvas = document.getElementById('pendulumCanvas');
const ctx = canvas.getContext('2d');
const countSlider = document.getElementById('countSlider');
const countDisplay = document.getElementById('countDisplay');
const speedSlider = document.getElementById('speedSlider');
const speedDisplay = document.getElementById('speedDisplay');
const trailToggle = document.getElementById('trailToggle');
const audioToggle = document.getElementById('audioToggle');

let pendulums = [];
let numPendulums = parseInt(countSlider.value, 10);
let showTrails = false;
let enableAudio = false;
let speedFactor = parseInt(speedSlider.value, 10);
const dt = 0.02;
const g = 9.81;
const L1 = 0.4;
const L2 = 0.4;
const scale = 250;
let audioContext = null;
let masterGain = null;
let oscillators = [];

const DAMPING = 0.999;
const MAX_W2 = 20;

let lastRenderTime = Date.now();
const crashThreshold = 1000;
let lastFrameTime = performance.now();
const targetFPS = 60;
let timeAccumulator = 0;

function whatIsThisToggle() {
  if(!whatIsThis) {
    whatIsThis = true;
    document.getElementsByClassName("what-is-this")[0].innerText = "Hide explanation";
    document.getElementsByClassName("what-is-this-explained")[0].classList.remove("hidden");
  }
  else {
    whatIsThis = false;
    document.getElementsByClassName("what-is-this")[0].innerText = "What is this?";
    document.getElementsByClassName("what-is-this-explained")[0].classList.add("hidden");
  }
}

setInterval(() => {
  const currentTime = Date.now();
  if (currentTime - lastRenderTime > crashThreshold) {
    console.log("Canvas rendering has stopped or crashed!");
  }
}, 500);

class DoublePendulum {
  constructor(theta1, theta2, color, audioIndex) {
    this.theta1 = theta1;
    this.theta2 = theta2;
    this.w1 = 0;
    this.w2 = 0;
    this.color = color;
    this.trail = [];
    this.audioIndex = audioIndex;
    this.lastFrequency = 220;
  }

  step() {
    let m1 = 1, m2 = 1;
    let denom = (2*m1 + m2 - m2*Math.cos(2*this.theta1 - 2*this.theta2));
    if (Math.abs(denom) < 1e-12) return;
    let a1 = (-g*(2*m1+m2)*Math.sin(this.theta1)
              - m2*g*Math.sin(this.theta1-2*this.theta2)
              - 2*m2*Math.sin(this.theta1 - this.theta2)*(this.w2*this.w2*L2 + this.w1*this.w1*L1*Math.cos(this.theta1 - this.theta2))
             )/(L1*denom);
    let a2 = (2*Math.sin(this.theta1 - this.theta2)*(this.w1*this.w1*L1*(m1+m2)+g*(m1+m2)*Math.cos(this.theta1)+this.w2*this.w2*L2*m2*Math.cos(this.theta1 - this.theta2)))/(L2*denom);

    this.w1 += a1*dt;
    this.w2 += a2*dt;
    this.w1 *= DAMPING;
    this.w2 *= DAMPING;
    if (Math.abs(this.w2) > MAX_W2) this.w2 = Math.sign(this.w2)*MAX_W2;
    this.theta1 += this.w1*dt;
    this.theta2 += this.w2*dt;

    if (enableAudio && oscillators[this.audioIndex]) {
      let w2Val = Math.abs(this.w2);
      if (!Number.isFinite(w2Val)) w2Val=0;
      w2Val = Math.min(w2Val,10);
      let frequency = 220 + w2Val*200;
      if (!Number.isFinite(frequency)) frequency = this.lastFrequency;
      frequency = Math.min(Math.max(frequency,20),2000);
      this.lastFrequency = frequency;
      oscillators[this.audioIndex].frequency.setValueAtTime(frequency, audioContext.currentTime);
    }
  }
   
  draw(ctx) {
    let originX = canvas.width/2;
    let originY = canvas.height/3;
    let x1 = originX + L1*scale*Math.sin(this.theta1);
    let y1 = originY + L1*scale*Math.cos(this.theta1);
    let x2 = x1 + L2*scale*Math.sin(this.theta2);
    let y2 = y1 + L2*scale*Math.cos(this.theta2);

    if (showTrails) {
      this.trail.push({ x: x2, y: y2 });
      if (this.trail.length > 100) this.trail.shift();
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < this.trail.length - 1; i++) {
        let p1 = this.trail[i];
        let p2 = this.trail[i + 1];
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x1, y1, 8, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x2, y2, 8, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
  }
}

function getRandomColor() {
  let hue=Math.floor(Math.random()*360);
  return `hsl(${hue},80%,60%)`;
}

function createOscillatorForPendulum() {
  if(!enableAudio||!audioContext)return null;
  let oscillator=audioContext.createOscillator();
  oscillator.type="sine";
  oscillator.frequency.setValueAtTime(220,audioContext.currentTime);
  oscillator.start();
  oscillator.connect(masterGain);
  return oscillator;
}

function stopAllOscillators(){
  for(let osc of oscillators){
    if(osc) osc.stop();
  }
  oscillators=[];
}

function resetPendulums(){
  stopAllOscillators();
  pendulums=[];
  if(enableAudio){
    audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();
    masterGain=masterGain||audioContext.createGain();
    if(masterGain.gain.value !== undefined){
      if(numPendulums <= 85){
        masterGain.gain.setValueAtTime(1.0, audioContext.currentTime);
      } else if(numPendulums <= 150){
        masterGain.gain.setValueAtTime(0.85, audioContext.currentTime);
      } else if(numPendulums <= 500){
        masterGain.gain.setValueAtTime(0.6, audioContext.currentTime);
      } else {
        masterGain.gain.setValueAtTime(0.5, audioContext.currentTime);
      }
    } else {
      if(numPendulums <= 85){
        masterGain.gain.value = 1.0;
      } else if(numPendulums <= 150){
        masterGain.gain.value = 0.85;
      } else if(numPendulums <= 500){
        masterGain.gain.value = 0.6;
      } else {
        masterGain.gain.value = 0.5;
      }
    }
    masterGain.connect(audioContext.destination);
  }
  let baseTheta1=Math.PI/2;
  let baseTheta2=Math.PI/2;
  for(let i=0;i<numPendulums;i++){
    let d1=(Math.random()-0.5)*0.01;
    let d2=(Math.random()-0.5)*0.01;
    let color=i===numPendulums-1?'#ff00ff':getRandomColor();
    let osc=enableAudio?createOscillatorForPendulum():null;
    if(enableAudio)oscillators.push(osc);
    pendulums.push(new DoublePendulum(baseTheta1+d1,baseTheta2+d2,color,i));
  }
  timeAccumulator = 0;
  lastFrameTime = performance.now();
}

countSlider.addEventListener("input",()=>{
  numPendulums=parseInt(countSlider.value,10);
  countDisplay.textContent=numPendulums;
  resetPendulums();
});

speedSlider.addEventListener("input",()=>{
  let frontendValue=parseInt(speedSlider.value,10);
  speedFactor=frontendValue;
  speedDisplay.textContent=`${frontendValue}x`;
});

trailToggle.addEventListener("change",()=>{
  showTrails=trailToggle.checked;
});

audioToggle.addEventListener("change",()=>{
  enableAudio=audioToggle.checked;
  resetPendulums();
});

function animate(currentTime){
  const deltaTime = currentTime - lastFrameTime;
  lastFrameTime = currentTime;

  timeAccumulator += deltaTime;

  const timeStep = (1000 / targetFPS) * speedFactor;

  if (timeAccumulator >= timeStep) {
    for(let p of pendulums){
      p.step();
    }
    timeAccumulator -= timeStep;
  }

  ctx.clearRect(0,0,canvas.width,canvas.height);
  for(let p of pendulums){
    p.draw(ctx);
  }

  lastRenderTime = Date.now();
  requestAnimationFrame(animate);
}

document.addEventListener('visibilitychange', function() {
  if (audioContext) {
    if (document.hidden) {
      audioContext.suspend();
    } else {
      audioContext.resume();
    }
  }
});

resetPendulums();
animate(performance.now());

const titleElement=document.getElementById('titleText');
const titleString=titleElement.textContent;
titleElement.textContent='';
const letters=titleString.split('').map(char=>{
  const span=document.createElement('span');
  span.textContent=char;
  titleElement.appendChild(span);
  return span;
});
const neonColors=["#FF00FF","#00FFFF","#00FF00","#FFFF00","#FF0000","#FF9900","#00FF99"];
let currentColorIndex=0;
let currentLetterIndex=0;
letters.forEach(letter=>{
  letter.style.transition="color 1s ease";
});
function cycleColors(){
  letters[currentLetterIndex].style.color=neonColors[currentColorIndex];
  currentLetterIndex++;
  if(currentLetterIndex>=letters.length){
    currentLetterIndex=0;
    currentColorIndex=(currentColorIndex+1)%neonColors.length;
    setTimeout(startCycle,5000);
  }else{
    setTimeout(cycleColors,100);
  }
}
function startCycle(){
  cycleColors();
}
startCycle();
