import * as THREE from "three";
import { Vector3 } from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls";
import * as IonSDK from "ion-sdk-js";
import { IonSFUJSONRPCSignal } from "ion-sdk-js/lib/signal/json-rpc-impl";

const signal = new IonSFUJSONRPCSignal("ws://localhost:7000/ws");
const client = new IonSDK.Client(signal);
const audioCtx = new window.AudioContext();
var dc;
var streams = {};
var players = {};
const metadata = {
  id: null,
  position: {
    x: 0,
    y: 0,
    z: 0,
  },
};

signal.onopen = async () => {
  await client.join("ion");
  let localStream = await IonSDK.LocalStream.getUserMedia({
    audio: true,
    video: false,
  });
  metadata.id = localStream.id;
  client.publish(localStream);
  dc = client.createDataChannel("data");
  dc.onopen = () => console.log("data channel open");
};

function updatePlayer(id) {
  let _player = players[id];
  let _pos = streams[id].position;
  if (_pos === undefined || _player === undefined) return;
  _player.move(_pos.x, _pos.z);
  _player.panner.positionX.value = _pos.x - mainPlayer.position.x;
  _player.panner.positionZ.value = _pos.y - mainPlayer.position.z;
}

function deletePlayer(id) {
  let _player = players[id];
  _player.destroy();
  delete players[id];
}

function updateStream(streamId) {
  if (players[streamId] !== undefined) updatePlayer(streamId);
  if (
    streams[streamId] === undefined ||
    players[streamId] !== undefined ||
    streams[streamId].stream === undefined ||
    streams[streamId].position === undefined
  )
    return;

  // audio init
  let stream = streams[streamId].stream;
  let pos = streams[streamId].position;
  if (pos === undefined || stream === undefined) return;
  new Audio().srcObject = stream;
  let source = audioCtx.createMediaStreamSource(stream);
  let panner = audioCtx.createPanner();
  panner.positionX.value = pos.x - mainPlayer.position.x;
  panner.positionZ.value = pos.z - mainPlayer.position.z;
  panner.refDistance = 5;
  source.connect(panner).connect(audioCtx.destination);

  // add player to map
  let _pos = streams[streamId].position;
  if (_pos === undefined) return;
  let _player = new Player(scene, _pos.x, _pos.z);
  _player.panner = panner;
  players[streamId] = _player;
}

client.ontrack = (track, stream) => {
  if (track.kind === "audio") {
    streams[stream.id] = { ...streams[stream.id], stream };
    stream.onremovetrack = () => {
      deletePlayer(stream.id);
      delete streams[stream.id];
    };

    updateStream(stream.id);
  }
};

client.ondatachannel = (e) => {
  e.channel.onmessage = (msg) => {
    try {
      let payload = JSON.parse(msg.data);
      streams[payload.id] = {
        ...streams[payload.id],
        position: payload.position,
      };
      updateStream(payload.id);
    } catch (err) {
      console.log(err);
    }
  };
};

class Player {
  constructor(scene, x = 0, z = 0) {
    this.position = new THREE.Vector3(x, 0, z);
    this.height = 4;
    var geometry = new THREE.CapsuleGeometry(1, this.height - 2, 5, 20);
    var material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    var body = new THREE.Mesh(geometry, material);
    this.body = body;
    this.body.position.set(x, this.height / 2, z);
    scene.add(body);
  }

  move(x, z) {
    this.position.set(x, this.height / 2, z);
    this.body.position.set(x, this.height / 2, z);
    this.updateFPCamera();
  }

  addVector(v) {
    this.position.add(v);
    this.body.position.add(v);
    this.updateFPCamera();
  }

  addFPCamera(camera) {
    this.camera = camera;
    this.camera.position.set(this.position.x, this.height, this.position.z);
    // this.camera.lookAt(new THREE.Vector3(1000, 1000, this.height));
  }

  updateFPCamera() {
    if (this.camera === undefined) return;
    this.camera.position.x = this.position.x;
    this.camera.position.z = this.position.z;
  }

  destroy() {
    scene.remove(this.body);
  }
}

const viewport = document.getElementById("viewport");
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
const renderer = new THREE.WebGLRenderer();

renderer.setSize(window.innerWidth, window.innerHeight);

viewport.appendChild(renderer.domElement);

const buttons = {
  w: 0,
  a: 0,
  s: 0,
  d: 0,
};

document.addEventListener("keydown", (e) => {
  switch (e.code) {
    case "KeyW":
      buttons["w"] = 1;
      break;
    case "KeyA":
      buttons["a"] = 1;
      break;
    case "KeyS":
      buttons["s"] = 1;
      break;
    case "KeyD":
      buttons["d"] = 1;
      break;
  }
});

document.addEventListener("keyup", (e) => {
  switch (e.code) {
    case "KeyW":
      buttons["w"] = 0;
      break;
    case "KeyA":
      buttons["a"] = 0;
      break;
    case "KeyS":
      buttons["s"] = 0;
      break;
    case "KeyD":
      buttons["d"] = 0;
      break;
  }
});

const geometry = new THREE.PlaneGeometry(50, 50);
const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const plane = new THREE.Mesh(geometry, material);
plane.rotateX(-Math.PI / 2);
scene.add(plane);

const controls = new PointerLockControls(camera, renderer.domElement);
viewport.onclick = () => {
  if (!controls.isLocked) controls.lock();
};

var mainPlayer = new Player(scene);
mainPlayer.addFPCamera(camera, controls);

function updatePosition() {
  var movDir = new Vector3();
  let speed = 0.25;
  if (buttons["w"] === 1) {
    let _vector = new Vector3();
    _vector.setFromMatrixColumn(camera.matrix, 0);
    _vector.crossVectors(camera.up, _vector);
    movDir.addScaledVector(_vector, 1);
  }
  if (buttons["s"] === 1) {
    let _vector = new Vector3();
    _vector.setFromMatrixColumn(camera.matrix, 0);
    _vector.crossVectors(camera.up, _vector);
    movDir.addScaledVector(_vector, -1);
  }
  if (buttons["d"] === 1) {
    let _vector = new Vector3();
    _vector.setFromMatrixColumn(camera.matrix, 0);
    movDir.addScaledVector(_vector, 1);
  }
  if (buttons["a"] === 1) {
    let _vector = new Vector3();
    _vector.setFromMatrixColumn(camera.matrix, 0);
    movDir.addScaledVector(_vector, -1);
  }
  mainPlayer.addVector(movDir.normalize().multiplyScalar(speed));
  metadata.position = {
    x: mainPlayer.position.x,
    y: mainPlayer.position.y,
    z: mainPlayer.position.z,
  };
  Object.entries(players)
    .filter(([_, pl]) => pl.position !== undefined)
    .forEach(([_, player]) => {
      player.panner.positionX.value = player.position.x - mainPlayer.position.x;
      player.panner.positionZ.value = player.position.z - mainPlayer.position.z;
    });
}

let clock = new THREE.Clock();
let fps = 30;
let delta = 0;

function animate() {
  requestAnimationFrame(animate);
  updatePosition();
  renderer.render(scene, camera);
  delta += clock.getDelta();
  if (dc) dc.send(JSON.stringify(metadata));
  delta = delta % (1 / fps);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
