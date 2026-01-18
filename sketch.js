// --- 核心变量 ---
let centerX, centerY, radius;
let video, handPose;
let hands = [];
let raindrops = [];
let floatingWords = [];
let fireworks = [];

// 全局滤镜颜色 (默认透明)
let currentFilterColor = null;
let filterAlpha = 0;

// --- 交互配置 ---
const SPRINGING = 0.08; // 宠物跟随灵敏度
const MIN_KEYPOINTS = 8; 

// 单词库与对应的颜色
const wordData = [
  { text: "Confidence", color: [255, 100, 100] }, // 红
  { text: "Courage",    color: [255, 165, 0] },   // 橙
  { text: "Wisdom",     color: [100, 100, 255] }, // 蓝
  { text: "Kindness",   color: [255, 100, 255] }, // 粉
  { text: "Strength",   color: [50, 255, 50] },   // 绿
  { text: "Joy",        color: [255, 215, 0] }    // 金
];

// --- 初始化 ---
function preload() {
  handPose = ml5.handPose();
}

function setup() {
  createCanvas(640, 480);
  centerX = width / 2;
  centerY = height / 2;
  radius = 50;

  // 1. 初始化摄像头
  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();
  
  // 2. 启动手势检测
  handPose.detectStart(video, gotHands);

  // 3. 初始化雨滴
  for (let i = 0; i < 50; i++) {
    raindrops.push(new Raindrop());
  }
}

function draw() {
  // 1. 绘制镜像视频背景
  push();
  translate(width, 0);
  scale(-1, 1);
  image(video, 0, 0, width, height);
  pop();

  // 2. 应用滤镜 (如果有)
  if (filterAlpha > 0 && currentFilterColor) {
    push();
    noStroke();
    // 滤镜颜色 + 透明度
    fill(currentFilterColor[0], currentFilterColor[1], currentFilterColor[2], filterAlpha);
    rect(0, 0, width, height);
    pop();
    // 滤镜慢慢淡去
    filterAlpha -= 2; 
  }

  // 3. 绘制雨滴
  raindrops.forEach(d => { d.fall(); d.show(); });

  // 4. 生成和绘制多彩单词
  manageFloatingWords();

  // --- 核心：手部交互逻辑 ---
  if (hands.length > 0) {
    const hand = hands[0];

    if (hand.keypoints && hand.keypoints.length >= MIN_KEYPOINTS) {
      
      // 获取关键点 (镜像处理)
      const indexFinger = hand.keypoints[8]; // 食指
      const thumb = hand.keypoints[4];       // 拇指
      const pinky = hand.keypoints[20];      // 小指
      
      const mirroredIndexX = width - indexFinger.x;
      const mirroredIndexY = indexFinger.y;
      
      const mirroredThumbX = width - thumb.x;
      const mirroredThumbY = thumb.y;
      
      const mirroredPinkyX = width - pinky.x;
      const mirroredPinkyY = pinky.y;

      // [A] 宠物交互：跟随食指
      moveEllipse(mirroredIndexX, mirroredIndexY);

      // [B] 拇指-食指间距控制宠物大小
      const d = dist(mirroredThumbX, mirroredThumbY, mirroredIndexX, mirroredIndexY);
      radius = constrain(map(d, 20, 150, 30, 80), 30, 80);

      // [C] 绘制手部关键点
      drawKeypoints(hand.keypoints);

      // [D] 单词碰撞检测 (宠物碰到单词 -> 触发滤镜)
      checkWordCollisions();
      
      // [E] 五指张开检测 -> 触发随机烟花
      // 计算拇指和小指的距离，判断是否张开
      const handSpan = dist(mirroredThumbX, mirroredThumbY, mirroredPinkyX, mirroredPinkyY);
      
      // 阈值设为 180 (根据摄像头距离可能需要微调)
      if (handSpan > 180) {
        // 计算手心位置 (大约在中指根部附近，索引9)
        const middleBase = hand.keypoints[9];
        const palmX = width - middleBase.x;
        const palmY = middleBase.y;
        
        // 限制发射频率
        if (frameCount % 8 === 0) {
           createRandomFirework(palmX, palmY);
        }
      }
    }
  }

  // 5. 绘制宠物 (最上层)
  drawPet();

  // 6. 绘制烟花
  updateFireworks();
}

// --- 逻辑函数 ---

// 宠物跟随 (带弹性)
function moveEllipse(targetX, targetY) {
  const dx = targetX - centerX;
  const dy = targetY - centerY;
  centerX += dx * SPRINGING;
  centerY += dy * SPRINGING;
  
  // 边界限制
  centerX = constrain(centerX, radius, width - radius);
  centerY = constrain(centerY, radius, height - radius);
}

// 绘制宠物
function drawPet() {
  // 身体
  noStroke();
  fill(255, 255, 255, 200); 
  ellipse(centerX, centerY, radius * 2, radius * 1.6);
  
  // 腮红 (根据当前滤镜颜色变化)
  if (currentFilterColor) {
    fill(currentFilterColor[0], currentFilterColor[1], currentFilterColor[2], 150);
  } else {
    fill(255, 100, 100, 100);
  }
  ellipse(centerX - radius*0.5, centerY + radius*0.1, radius*0.4, radius*0.3);
  ellipse(centerX + radius*0.5, centerY + radius*0.1, radius*0.4, radius*0.3);

  // 眼睛
  fill(0);
  let eyeSize = radius * 0.2;
  ellipse(centerX - radius*0.3, centerY - radius*0.1, eyeSize, eyeSize * 1.2);
  ellipse(centerX + radius*0.3, centerY - radius*0.1, eyeSize, eyeSize * 1.2);
  
  // 嘴巴
  noFill();
  stroke(0);
  strokeWeight(2);
  arc(centerX, centerY + radius*0.1, radius*0.3, radius*0.3, 0, PI);
}

// 管理单词生成与绘制
function manageFloatingWords() {
  // 随机生成
  if (frameCount % 90 === 0 && floatingWords.length < 5) {
    const data = random(wordData);
    floatingWords.push(new FloatingWord(data.text, data.color));
  }
  
  for (let i = floatingWords.length - 1; i >= 0; i--) {
    let fw = floatingWords[i];
    fw.update();
    fw.show();
    if (fw.isDead()) floatingWords.splice(i, 1);
  }
}

// 检测宠物与单词的碰撞
function checkWordCollisions() {
  for (let i = floatingWords.length - 1; i >= 0; i--) {
    let fw = floatingWords[i];
    // 计算宠物中心与单词中心的距离
    let d = dist(centerX, centerY, fw.x, fw.y);
    
    // 如果碰到了 (宠物半径 + 单词大概半径)
    if (d < radius + 30) {
      // 1. 触发滤镜
      currentFilterColor = fw.color;
      filterAlpha = 150; // 重置滤镜透明度
      
      // 2. 单词消失效果 (或弹开，这里选择消失以获得反馈)
      fw.life = 0; 
      
      // 3. 产生一个小特效提示碰到啦
      createCollisionEffect(fw.x, fw.y, fw.color);
    }
  }
}

// 随机烟花生成器
function createRandomFirework(x, y) {
  let shapeType = random(["circle", "star", "heart", "triangle"]);
  let baseColor = [random(255), random(255), random(255)];
  let size = random(5, 15);
  
  // 一次发射 10 个粒子
  for(let i=0; i<10; i++) {
    fireworks.push(new FireworkParticle(x, y, shapeType, baseColor, size));
  }
}

function updateFireworks() {
  for (let i = fireworks.length - 1; i >= 0; i--) {
    let fw = fireworks[i];
    fw.update();
    fw.show();
    if (fw.isDead()) fireworks.splice(i, 1);
  }
}

// --- 辅助绘制 ---
function drawKeypoints(keypoints) {
  for (let kp of keypoints) {
    const x = width - kp.x; 
    const y = kp.y;
    fill(255, 255, 255, 150);
    noStroke();
    circle(x, y, 6);
  }
}

function createCollisionEffect(x, y, col) {
  // 简单的碰撞圈圈
  fireworks.push(new FireworkParticle(x, y, "circle", col, 30));
}

// --- ml5回调 ---
function gotHands(results) {
  hands = results;
}

// --- 类定义 ---

class FloatingWord {
  constructor(text, color) {
    this.text = text;
    this.color = color; // [r, g, b]
    this.x = random(50, width - 50);
    this.y = height + 20; // 从底部升起
    this.speed = random(1, 3);
    this.life = 255;
  }
  
  update() {
    this.y -= this.speed;
    this.life -= 1;
  }
  
  show() {
    push();
    textAlign(CENTER);
    textSize(28);
    textStyle(BOLD);
    // 阴影
    fill(0, 100);
    text(this.text, this.x + 2, this.y + 2);
    // 颜色文字
    fill(this.color[0], this.color[1], this.color[2], this.life);
    text(this.text, this.x, this.y);
    pop();
  }
  
  isDead() { return this.y < -50 || this.life <= 0; }
}

class FireworkParticle {
  constructor(x, y, shape, color, baseSize) {
    this.pos = createVector(x, y);
    this.vel = p5.Vector.random2D().mult(random(2, 6)); // 随机向四周炸开
    this.acc = createVector(0, 0.1); // 重力
    this.shape = shape;
    this.color = color;
    this.size = baseSize * random(0.5, 1.5);
    this.alpha = 255;
    this.rotation = random(TWO_PI);
  }
  
  update() {
    this.vel.add(this.acc);
    this.pos.add(this.vel);
    this.alpha -= 5;
    this.rotation += 0.1;
  }
  
  show() {
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.rotation);
    noStroke();
    fill(this.color[0], this.color[1], this.color[2], this.alpha);
    
    if (this.shape === "circle") {
      circle(0, 0, this.size);
    } else if (this.shape === "star") {
      drawStar(0, 0, 5, this.size, this.size/2);
    } else if (this.shape === "triangle") {
      triangle(0, -this.size, -this.size, this.size, this.size, this.size);
    } else if (this.shape === "heart") {
      beginShape();
      vertex(0, 0);
      bezierVertex(-this.size/2, -this.size/2, -this.size, this.size/2, 0, this.size);
      bezierVertex(this.size, this.size/2, this.size/2, -this.size/2, 0, 0);
      endShape();
    }
    pop();
  }
  
  isDead() { return this.alpha <= 0; }
}

class Raindrop {
  constructor() {
    this.reset();
  }
  reset() {
    this.x = random(width);
    this.y = random(-100, -10);
    this.speed = random(5, 10);
  }
  fall() {
    this.y += this.speed;
    if(this.y > height) this.reset();
  }
  show() {
    stroke(200, 200, 255, 80);
    line(this.x, this.y, this.x, this.y + 15);
  }
}

function drawStar(x, y, npoints, radius1, radius2) {
  let angle = TWO_PI / npoints;
  let halfAngle = angle / 2.0;
  beginShape();
  for (let a = 0; a < TWO_PI; a += angle) {
    let sx = x + cos(a) * radius2;
    let sy = y + sin(a) * radius2;
    vertex(sx, sy);
    sx = x + cos(a + halfAngle) * radius1;
    sy = y + sin(a + halfAngle) * radius1;
    vertex(sx, sy);
  }
  endShape(CLOSE);
}
