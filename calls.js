import { auth, db, appCheckHeaders } from "./firebase.js";
import { APP_CONFIG } from "./config.js";
import { addDoc, collection, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const FALLBACK_ICE = Array.isArray(APP_CONFIG.rtcIceServers) && APP_CONFIG.rtcIceServers.length
  ? APP_CONFIG.rtcIceServers
  : [{ urls: "stun:stun.cloudflare.com:3478" }];

let resolvedIceServers = FALLBACK_ICE;
let turnReady = false;
let turnPromise = null;
let turnFetchedAt = 0;
let getPeer = () => null;
let canCall = () => false;
let notify = console.log;
let activeCall = null;
let pc = null;
let localStream = null;
let remoteAudioStream = null;
let remoteVideoStream = null;
let unsubscribeCall = null;
let unsubscribeCandidates = null;
let unsubscribeIncoming = null;
let pendingIncoming = null;
let candidateQueue = [];
let localCandidateQueue = [];
let canWriteLocalCandidates = false;
let callConnectTimer = null;
let disconnectTimer = null;
let screenStream = null;
let initialized = false;
let ringTimer = null;
let ringAudioContext = null;
let callStartedAt = 0;
let callTimer = null;
let statsTimer = null;
let lastStats = null;
let mixedAudioContext = null;
let originalAudioSenderTrack = null;
let currentVideoSender = null;
let recoveryTimer = null;
let recoveryBusy = false;
let lastRecoveryAt = 0;
let processedRestartOfferSeq = 0;
let processedRestartAnswerSeq = 0;
let processedRestartRequestSeq = 0;

const $ = id => document.getElementById(id);
const cleanName = value => String(value || "Gamer").slice(0, 60);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function peerInfo() {
  const peer = getPeer?.();
  return peer?.uid ? peer : null;
}

function renderButtons() {
  const allowed = Boolean(peerInfo() && canCall?.());
  if ($("chatCallActions")) $("chatCallActions").hidden = !allowed;
  if ($("audioCallButton")) $("audioCallButton").disabled = !allowed || Boolean(activeCall);
  if ($("videoCallButton")) $("videoCallButton").disabled = !allowed || Boolean(activeCall);
}

function setCallPerson(peer, incoming = false) {
  if (!peer) return;
  const name = cleanName(peer.name || peer.username);
  const avatar = $("callAvatar");
  if (avatar) {
    avatar.innerHTML = "";
    if (peer.photoURL) {
      const image = document.createElement("img");
      image.src = peer.photoURL;
      image.alt = `Foto de ${name}`;
      image.referrerPolicy = "no-referrer";
      image.onerror = () => { avatar.textContent = name.slice(0, 2).toUpperCase(); };
      avatar.appendChild(image);
    } else avatar.textContent = name.slice(0, 2).toUpperCase();
  }
  if ($("callTitle")) $("callTitle").textContent = name;
  if ($("callEyebrow")) $("callEyebrow").textContent = incoming ? "CHAMADA RECEBIDA" : "CALL NOW";
}

function setStatus(text, tone = "") {
  if ($("callStatus")) $("callStatus").textContent = text;
  if ($("callStatePill")) {
    $("callStatePill").textContent = text;
    $("callStatePill").dataset.tone = tone;
  }
  if (activeCall) updateDock();
}

function showDialog() {
  const dialog = $("callDialog");
  if (!dialog || dialog.open) return;
  // Não modal: o usuário continua podendo conversar durante a chamada.
  dialog.show();
  dialog.classList.remove("minimized");
}

function updateDock() {
  const dock = $("callDock");
  if (!dock) return;
  dock.hidden = !activeCall;
  if (!activeCall) return;
  const peer = peerInfo();
  const name = cleanName(peer?.name || peer?.username || $("callTitle")?.textContent || "Ligação");
  $("callDockName") && ($("callDockName").textContent = name);
  $("callDockStatus") && ($("callDockStatus").textContent = $("callStatus")?.textContent || "Em chamada");
}

async function getTurnIceServers(force = false) {
  const now = Date.now();
  if (!force && turnPromise && now - turnFetchedAt < 45 * 60 * 1000) return turnPromise;
  turnFetchedAt = now;
  turnPromise = (async () => {
    const user = auth.currentUser;
    if (!user || !APP_CONFIG.steamApiBaseUrl) return FALLBACK_ICE;
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${APP_CONFIG.steamApiBaseUrl}/turn/credentials`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...(await appCheckHeaders())
        },
        body: JSON.stringify({ ttl: 7200 })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(data.iceServers) || !data.iceServers.length) throw new Error(data.error || "TURN_UNAVAILABLE");
      const cleaned = data.iceServers.map(server => {
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls].filter(Boolean);
        return { ...server, urls: urls.filter(url => !/:53(?:\?|$)/.test(String(url))) };
      }).filter(server => Array.isArray(server.urls) ? server.urls.length : Boolean(server.urls));
      turnReady = cleaned.some(server => (Array.isArray(server.urls) ? server.urls : [server.urls]).some(url => /^turns?:/i.test(String(url))));
      resolvedIceServers = cleaned.length ? cleaned : FALLBACK_ICE;
      return resolvedIceServers;
    } catch (error) {
      console.warn("TURN indisponível; usando STUN", error);
      turnReady = false;
      resolvedIceServers = FALLBACK_ICE;
      return FALLBACK_ICE;
    }
  })();
  return turnPromise;
}

function peerConfig() {
  return {
    iceServers: resolvedIceServers,
    iceCandidatePoolSize: 10,
    iceTransportPolicy: "all",
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require"
  };
}

function ensureAudioContext() {
  if (!ringAudioContext) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (Context) ringAudioContext = new Context();
  }
  return ringAudioContext;
}

async function primeAudio() {
  try {
    const context = ensureAudioContext();
    if (context?.state === "suspended") await context.resume();
  } catch {}
}

function toneBurst(kind = "outgoing") {
  const context = ensureAudioContext();
  if (!context || context.state === "suspended") return;
  const now = context.currentTime;
  const duration = kind === "incoming" ? .9 : .65;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(kind === "incoming" ? .12 : .075, now + .025);
  gain.gain.setValueAtTime(kind === "incoming" ? .12 : .075, now + duration - .06);
  gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
  gain.connect(context.destination);
  for (const frequency of (kind === "incoming" ? [440, 480] : [425])) {
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
}

function stopRinging() {
  clearInterval(ringTimer);
  ringTimer = null;
  try { navigator.vibrate?.(0); } catch {}
  $("callDialog")?.classList.remove("ringing");
}

async function startRinging(kind) {
  stopRinging();
  await primeAudio();
  $("callDialog")?.classList.add("ringing");
  toneBurst(kind);
  if (kind === "incoming") {
    try { navigator.vibrate?.([350, 180, 350]); } catch {}
  }
  ringTimer = setInterval(() => {
    toneBurst(kind);
    if (kind === "incoming") {
      try { navigator.vibrate?.([350, 180, 350]); } catch {}
    }
  }, kind === "incoming" ? 2500 : 3000);
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h ? `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function startCallClock() {
  if (callStartedAt) return;
  callStartedAt = Date.now();
  clearInterval(callTimer);
  const paint = () => { if ($("callTimer")) $("callTimer").textContent = formatDuration(Date.now() - callStartedAt); };
  paint();
  callTimer = setInterval(paint, 1000);
}

function stopCallClock() {
  callStartedAt = 0;
  clearInterval(callTimer);
  callTimer = null;
  if ($("callTimer")) $("callTimer").textContent = "00:00";
}

function updateNetworkBadge({ quality = "Conectando", detail = "", relay = false } = {}) {
  const badge = $("callNetwork");
  if (!badge) return;
  badge.dataset.quality = quality.toLowerCase();
  badge.innerHTML = `<i></i><span>${quality}</span>${detail ? `<small>${detail}</small>` : ""}${relay ? '<b>TURN</b>' : ""}`;
}

function stopStats() {
  clearInterval(statsTimer);
  statsTimer = null;
  lastStats = null;
}

function startStats() {
  stopStats();
  statsTimer = setInterval(async () => {
    if (!pc || pc.connectionState !== "connected") return;
    try {
      const reports = await pc.getStats();
      let pair = null, remoteCandidate = null, inboundAudio = null;
      reports.forEach(report => {
        if (report.type === "candidate-pair" && report.state === "succeeded" && report.nominated) pair = report;
        if (report.type === "inbound-rtp" && report.kind === "audio" && !report.isRemote) inboundAudio = report;
      });
      if (pair?.remoteCandidateId) remoteCandidate = reports.get(pair.remoteCandidateId);
      const rttMs = pair?.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1000) : null;
      const lost = Number(inboundAudio?.packetsLost || 0), received = Number(inboundAudio?.packetsReceived || 0);
      const loss = received + lost > 0 ? (lost / (received + lost)) * 100 : 0;
      let bitrate = null;
      if (inboundAudio?.bytesReceived != null) {
        const current = { bytes: Number(inboundAudio.bytesReceived), at: Date.now() };
        if (lastStats) bitrate = Math.max(0, ((current.bytes - lastStats.bytes) * 8) / ((current.at - lastStats.at) / 1000) / 1000);
        lastStats = current;
      }
      const relay = remoteCandidate?.candidateType === "relay";
      let quality = "Ótima";
      if ((rttMs != null && rttMs > 260) || loss > 5) quality = "Instável";
      else if ((rttMs != null && rttMs > 140) || loss > 2) quality = "Boa";
      const details = [rttMs != null ? `${rttMs} ms` : "", loss ? `${loss.toFixed(1)}% perda` : "", bitrate ? `${Math.round(bitrate)} kbps` : ""].filter(Boolean).join(" · ");
      updateNetworkBadge({ quality, detail: details, relay });
    } catch (error) {
      console.debug("stats", error);
    }
  }, 2200);
}

async function closeMixedAudio() {
  if (pc && originalAudioSenderTrack) {
    const sender = pc.getSenders().find(item => item.track?.kind === "audio" || item === pc.__sgAudioSender);
    if (sender) await sender.replaceTrack(originalAudioSenderTrack).catch(() => {});
  }
  originalAudioSenderTrack = null;
  if (mixedAudioContext) {
    await mixedAudioContext.close().catch(() => {});
    mixedAudioContext = null;
  }
}

async function stopScreenShare(statusText = "Compartilhamento encerrado") {
  if (!screenStream) return;
  const sender = currentVideoSender || pc?.getSenders().find(item => item.track?.kind === "video") || pc?.getTransceivers().find(item => item.sender?.track?.kind === "video")?.sender;
  const cameraTrack = localStream?.getVideoTracks?.()[0] || null;
  if (sender) await sender.replaceTrack(cameraTrack).catch(() => {});
  await closeMixedAudio();
  screenStream.getTracks().forEach(track => track.stop());
  screenStream = null;
  currentVideoSender = null;
  if ($("localVideo")) $("localVideo").srcObject = cameraTrack ? localStream : null;
  if (!remoteVideoStream?.getVideoTracks?.().length && activeCall?.type !== "video") $("callVideoStage") && ($("callVideoStage").hidden = true);
  $("callShare")?.classList.remove("active");
  $("callDialog")?.classList.remove("screen-sharing");
  setStatus(statusText, "ok");
}

function closeTracks() {
  stopRinging();
  stopCallClock();
  stopStats();
  clearTimeout(disconnectTimer); disconnectTimer = null;
  clearTimeout(recoveryTimer); recoveryTimer = null;
  recoveryBusy = false; lastRecoveryAt = 0;
  processedRestartOfferSeq = 0; processedRestartAnswerSeq = 0; processedRestartRequestSeq = 0;
  stopScreenShare().catch(() => {});
  try { pc?.close(); } catch {}
  pc = null;
  for (const stream of [localStream, remoteAudioStream, remoteVideoStream]) stream?.getTracks?.().forEach(track => track.stop());
  localStream = null;
  remoteAudioStream = null;
  remoteVideoStream = null;
  screenStream?.getTracks?.().forEach(track => track.stop());
  screenStream = null;
  if ($("localVideo")) $("localVideo").srcObject = null;
  if ($("remoteVideo")) $("remoteVideo").srcObject = null;
  if ($("remoteAudio")) $("remoteAudio").srcObject = null;
  unsubscribeCall?.(); unsubscribeCall = null;
  unsubscribeCandidates?.(); unsubscribeCandidates = null;
  clearTimeout(callConnectTimer); callConnectTimer = null;
  localCandidateQueue = []; canWriteLocalCandidates = false;
}

function resetUi() {
  activeCall = null;
  pendingIncoming = null;
  closeTracks();
  if ($("callAccept")) $("callAccept").hidden = true;
  if ($("callReject")) $("callReject").hidden = true;
  if ($("callHangup")) $("callHangup").hidden = false;
  if ($("callMute")) { $("callMute").disabled = false; $("callMute").classList.remove("off"); }
  if ($("callCamera")) { $("callCamera").disabled = false; $("callCamera").classList.remove("off"); }
  if ($("callShare")) { $("callShare").disabled = false; $("callShare").classList.remove("active"); }
  if ($("callVideoStage")) $("callVideoStage").hidden = true;
  if ($("callCamera")) $("callCamera").hidden = false;
  $("callDialog")?.classList.remove("minimized", "screen-sharing", "connected", "ringing");
  const dialog = $("callDialog");
  if (dialog?.open) dialog.close();
  updateNetworkBadge({ quality:"Offline" });
  updateDock();
  renderButtons();
}

async function getMedia(type) {
  let savedAudio = {};
  try { savedAudio = JSON.parse(localStorage.getItem("sg_call_audio_settings_v2") || "{}"); } catch {}
  const audio = {
    deviceId: savedAudio.inputId ? { exact: savedAudio.inputId } : undefined,
    echoCancellation: savedAudio.echoCancellation !== false,
    noiseSuppression: savedAudio.noiseSuppression !== false,
    autoGainControl: savedAudio.autoGainControl !== false,
    channelCount: 1,
    sampleRate: { ideal: 48000 }
  };
  const constraints = type === "video"
    ? { audio, video: { width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 }, frameRate:{ ideal:24, max:30 }, facingMode: "user" } }
    : { audio, video: false };
  localStream = await navigator.mediaDevices.getUserMedia(constraints);
  if (type === "video") {
    if ($("callVideoStage")) $("callVideoStage").hidden = false;
    if ($("localVideo")) $("localVideo").srcObject = localStream;
  } else {
    if ($("callVideoStage")) $("callVideoStage").hidden = true;
    if ($("callCamera")) $("callCamera").hidden = true;
  }
  return localStream;
}

function attachRemoteTrack(track) {
  if (track.kind === "audio") {
    remoteAudioStream ||= new MediaStream();
    if (!remoteAudioStream.getTracks().some(existing => existing.id === track.id)) remoteAudioStream.addTrack(track);
    const media = $("remoteAudio");
    if (media) {
      media.srcObject = remoteAudioStream;
      media.muted = false;
      media.volume = 1;
      try { const ap=JSON.parse(localStorage.getItem("sg_call_audio_settings_v2")||"{}"); if(ap.outputId && typeof media.setSinkId === "function") media.setSinkId(ap.outputId).catch(()=>{}); } catch {}
      media.play?.().catch(() => setStatus("Toque na chamada para liberar o áudio.", "warn"));
    }
    return;
  }
  if (track.kind === "video") {
    remoteVideoStream ||= new MediaStream();
    if (!remoteVideoStream.getTracks().some(existing => existing.id === track.id)) remoteVideoStream.addTrack(track);
    const video = $("remoteVideo");
    if (video) {
      video.srcObject = remoteVideoStream;
      video.play?.().catch(() => {});
    }
    if ($("callVideoStage")) $("callVideoStage").hidden = false;
    $("callDialog")?.classList.add("has-remote-video");
    track.onended = () => {
      remoteVideoStream?.removeTrack?.(track);
      if (!remoteVideoStream?.getVideoTracks?.().length && activeCall?.type !== "video" && !screenStream) {
        if ($("callVideoStage")) $("callVideoStage").hidden = true;
      }
    };
  }
}

async function createRestartOffer(reason = "network") {
  if (!pc || !activeCall?.ref || recoveryBusy || pc.signalingState === "closed") return;
  if (Date.now() - lastRecoveryAt < 7000) return;
  if (pc.signalingState !== "stable") return;
  recoveryBusy = true;
  lastRecoveryAt = Date.now();
  try {
    const iceServers = await getTurnIceServers(true);
    pc.setConfiguration({ ...peerConfig(), iceServers });
    pc.restartIce?.();
    const offer = await pc.createOffer({ iceRestart:true });
    await pc.setLocalDescription(offer);
    const seq = Date.now();
    processedRestartOfferSeq = seq;
    await updateDoc(activeCall.ref, {
      restartOffer:{ type:offer.type, sdp:offer.sdp },
      restartSeq:seq,
      restartBy:auth.currentUser?.uid || "",
      updatedAt:serverTimestamp()
    });
    setStatus(reason === "failed" ? "Recuperando chamada por rota TURN…" : "Reconectando por rota segura…", "wait");
    updateNetworkBadge({ quality:"Reconectando", relay:turnReady });
  } catch (error) {
    console.warn("ICE restart offer", error);
    setStatus("Não foi possível recuperar a rota automaticamente.", "warn");
  } finally {
    recoveryBusy = false;
  }
}

async function requestNetworkRecovery(reason = "network") {
  if (!pc || !activeCall?.ref || recoveryBusy) return;
  if (activeCall.outgoing) return createRestartOffer(reason);
  if (Date.now() - lastRecoveryAt < 7000) return;
  lastRecoveryAt = Date.now();
  try {
    await getTurnIceServers(true);
    pc.setConfiguration(peerConfig());
    const seq = Date.now();
    processedRestartRequestSeq = seq;
    await updateDoc(activeCall.ref, {
      restartRequestSeq:seq,
      restartRequestedBy:auth.currentUser?.uid || "",
      updatedAt:serverTimestamp()
    });
    setStatus("Solicitando uma nova rota de conexão…", "wait");
  } catch (error) {
    console.warn("ICE restart request", error);
  }
}

function makePeer(callRef, candidateSide, remoteCandidateSide, documentAlreadyExists = false) {
  pc = new RTCPeerConnection(peerConfig());
  canWriteLocalCandidates = documentAlreadyExists;
  localCandidateQueue = [];
  const writeCandidate = candidate => addDoc(collection(callRef, candidateSide), candidate).catch(error => console.warn("ICE write", error));
  const flushLocalCandidates = async () => {
    canWriteLocalCandidates = true;
    for (const candidate of localCandidateQueue.splice(0)) await writeCandidate(candidate);
  };
  pc.__sgFlushLocalCandidates = flushLocalCandidates;
  pc.ontrack = event => attachRemoteTrack(event.track);
  pc.onicecandidate = event => {
    if (!event.candidate) return;
    const candidate = event.candidate.toJSON();
    if (canWriteLocalCandidates) writeCandidate(candidate); else localCandidateQueue.push(candidate);
  };
  pc.onconnectionstatechange = () => {
    if (!pc) return;
    const state = pc.connectionState;
    updateDock();
    if (state === "connected") {
      clearTimeout(callConnectTimer);
      clearTimeout(disconnectTimer);
      stopRinging();
      startCallClock();
      startStats();
      $("callDialog")?.classList.add("connected");
      setStatus(turnReady ? "Conectado · rota otimizada" : "Conectado", "ok");
      $("remoteAudio")?.play?.().catch(()=>{});
    } else if (state === "connecting") {
      setStatus("Conectando com segurança…", "wait");
      updateNetworkBadge({ quality:"Conectando" });
    } else if (state === "disconnected") {
      setStatus("Conexão oscilando · tentando recuperar…", "warn");
      updateNetworkBadge({ quality:"Instável" });
      clearTimeout(disconnectTimer);
      disconnectTimer = setTimeout(() => {
        if (pc?.connectionState === "disconnected") {
          setStatus("Reconectando… buscando uma nova rota.", "warn");
          requestNetworkRecovery("disconnected").catch(() => {});
        }
      }, 2800);
    } else if (state === "failed") {
      stopRinging();
      updateNetworkBadge({ quality:"Falha" });
      setStatus(turnReady ? "A conexão caiu · tentando recuperar automaticamente…" : "TURN ainda não está configurado. Ative o Cloudflare TURN para redes restritas.", turnReady ? "warn" : "bad");
      if (turnReady) requestNetworkRecovery("failed").catch(() => {});
    }
  };
  pc.oniceconnectionstatechange = () => {
    if (!pc) return;
    if (pc.iceConnectionState === "checking") updateNetworkBadge({ quality:"Negociando" });
    if (pc.iceConnectionState === "failed") {
      setStatus(turnReady ? "Rota de mídia interrompida · recuperando…" : "A rede bloqueou P2P e não há TURN ativo.", turnReady ? "warn" : "bad");
      if (turnReady) requestNetworkRecovery("failed").catch(() => {});
    }
  };
  candidateQueue = [];
  unsubscribeCandidates?.();
  unsubscribeCandidates = onSnapshot(collection(callRef, remoteCandidateSide), snap => {
    for (const change of snap.docChanges()) {
      if (change.type !== "added") continue;
      const candidate = new RTCIceCandidate(change.doc.data());
      if (pc?.remoteDescription) pc.addIceCandidate(candidate).catch(error => console.warn("remote ICE", error));
      else candidateQueue.push(candidate);
    }
  }, error => console.warn("ICE listen", error));
  return pc;
}

function watchCall(callRef, isCaller) {
  unsubscribeCall?.();
  unsubscribeCall = onSnapshot(callRef, async snap => {
    if (!snap.exists() || !activeCall) return;
    const data = snap.data();
    if (isCaller && Number(data.restartRequestSeq || 0) > processedRestartRequestSeq) {
      processedRestartRequestSeq = Number(data.restartRequestSeq || 0);
      if (pc?.signalingState === "stable") await createRestartOffer("requested");
    }
    if (!isCaller && data.restartOffer && Number(data.restartSeq || 0) > processedRestartOfferSeq && pc) {
      processedRestartOfferSeq = Number(data.restartSeq || 0);
      try {
        const iceServers = await getTurnIceServers(false);
        pc.setConfiguration({ ...peerConfig(), iceServers });
        await pc.setRemoteDescription(new RTCSessionDescription(data.restartOffer));
        for (const candidate of candidateQueue.splice(0)) await pc.addIceCandidate(candidate).catch(error => console.warn("restart queued ICE", error));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await updateDoc(activeCall.ref, {
          restartAnswer:{ type:answer.type, sdp:answer.sdp },
          restartAnswerSeq:Number(data.restartSeq || 0),
          updatedAt:serverTimestamp()
        });
        setStatus("Nova rota negociada · reconectando mídia…", "wait");
      } catch (error) { console.warn("apply restart offer", error); }
    }
    if (isCaller && data.restartAnswer && Number(data.restartAnswerSeq || 0) === Number(data.restartSeq || 0) && Number(data.restartAnswerSeq || 0) > processedRestartAnswerSeq && pc) {
      processedRestartAnswerSeq = Number(data.restartAnswerSeq || 0);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.restartAnswer));
        for (const candidate of candidateQueue.splice(0)) await pc.addIceCandidate(candidate).catch(error => console.warn("restart answer queued ICE", error));
        setStatus("Rota recuperada · conectando…", "wait");
      } catch (error) { console.warn("apply restart answer", error); }
    }
    if (isCaller && data.answer && pc && !pc.currentRemoteDescription) {
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      for (const candidate of candidateQueue.splice(0)) await pc.addIceCandidate(candidate).catch(error => console.warn("queued ICE", error));
      stopRinging();
      setStatus("Conectando mídia…", "wait");
    }
    if (data.status === "active") {
      stopRinging();
      startCallClock();
    }
    if (["ended", "rejected", "missed"].includes(data.status)) {
      notify(data.status === "rejected" ? "Ligação recusada." : "Ligação encerrada.");
      resetUi();
    }
  });
}

export async function startCall(type = "audio") {
  if (activeCall) return notify("Você já está em uma ligação.");
  const peer = peerInfo();
  if (!peer || !canCall?.()) return notify("A ligação é liberada entre Amigos Gamers.");
  const user = auth.currentUser;
  if (!user) return;
  try {
    await primeAudio();
    setStatus("Preparando conexão…", "wait");
    await getTurnIceServers(false);
    activeCall = { type, peerUid: peer.uid, outgoing: true };
    setCallPerson(peer, false);
    $("callAccept") && ($("callAccept").hidden = true);
    $("callReject") && ($("callReject").hidden = true);
    $("callHangup") && ($("callHangup").hidden = false);
    $("callCamera") && ($("callCamera").hidden = type !== "video");
    showDialog();
    updateDock();
    setStatus(type === "video" ? "Preparando câmera…" : "Preparando microfone…", "wait");
    const stream = await getMedia(type);
    const callRef = doc(collection(db, "calls"));
    activeCall.ref = callRef;
    const connection = makePeer(callRef, "callerCandidates", "calleeCandidates", false);
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) connection.__sgAudioSender = connection.addTrack(audioTrack, stream);
    if (type === "video") {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) currentVideoSender = connection.addTrack(videoTrack, stream);
    } else {
      // Reserva uma m-line de vídeo para permitir compartilhamento de tela em chamada de voz sem renegociação.
      const transceiver = connection.addTransceiver("video", { direction:"sendrecv" });
      currentVideoSender = transceiver.sender;
    }
    const offer = await connection.createOffer({ offerToReceiveAudio:true, offerToReceiveVideo:true });
    await connection.setLocalDescription(offer);
    await setDoc(callRef, {
      callerUid: user.uid,
      calleeUid: peer.uid,
      members: [user.uid, peer.uid].sort(),
      conversationId: [user.uid, peer.uid].sort().join("_"),
      type,
      status: "ringing",
      offer: { type: offer.type, sdp: offer.sdp },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await connection.__sgFlushLocalCandidates?.();
    watchCall(callRef, true);
    callConnectTimer = setTimeout(() => {
      if (activeCall?.ref?.id === callRef.id && pc?.connectionState !== "connected") {
        setStatus(turnReady ? "A outra pessoa ainda não conectou. Continuamos tentando." : "Ligação demorando. Configure TURN para máxima compatibilidade.", "warn");
      }
    }, 20000);
    setStatus("Chamando…", "ring");
    await startRinging("outgoing");
    renderButtons();
  } catch (error) {
    console.error("startCall", error);
    notify(error?.name === "NotAllowedError" ? "Permita microfone/câmera para fazer a ligação." : "Não foi possível iniciar a ligação.");
    resetUi();
  }
}

async function acceptIncoming() {
  if (!pendingIncoming || activeCall) return;
  const user = auth.currentUser;
  const { ref: callRef, data } = pendingIncoming;
  try {
    stopRinging();
    await primeAudio();
    await getTurnIceServers(false);
    activeCall = { type: data.type || "audio", peerUid: data.callerUid, outgoing: false, ref: callRef };
    $("callAccept") && ($("callAccept").hidden = true);
    $("callReject") && ($("callReject").hidden = true);
    $("callHangup") && ($("callHangup").hidden = false);
    setStatus("Conectando…", "wait");
    const stream = await getMedia(activeCall.type);
    const connection = makePeer(callRef, "calleeCandidates", "callerCandidates", true);
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) connection.__sgAudioSender = connection.addTrack(audioTrack, stream);
    if (activeCall.type === "video") {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) currentVideoSender = connection.addTrack(videoTrack, stream);
    }
    await connection.setRemoteDescription(new RTCSessionDescription(data.offer));
    // Em chamada de voz, a oferta do chamador já traz uma transceiver de vídeo reservada.
    if (!currentVideoSender) currentVideoSender = connection.getTransceivers().find(item => item.receiver?.track?.kind === "video")?.sender || null;
    for (const candidate of candidateQueue.splice(0)) await connection.addIceCandidate(candidate).catch(error => console.warn("queued ICE", error));
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    await updateDoc(callRef, {
      answer: { type: answer.type, sdp: answer.sdp },
      status: "active",
      acceptedBy: user.uid,
      acceptedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    watchCall(callRef, false);
    pendingIncoming = null;
    startCallClock();
    updateDock();
    renderButtons();
  } catch (error) {
    console.error("acceptIncoming", error);
    notify("Não foi possível atender a ligação.");
    await updateDoc(callRef, { status: "rejected", updatedAt: serverTimestamp() }).catch(() => {});
    resetUi();
  }
}

async function rejectIncoming() {
  stopRinging();
  if (!pendingIncoming) return resetUi();
  const ref = pendingIncoming.ref;
  await updateDoc(ref, { status: "rejected", updatedAt: serverTimestamp() }).catch(() => {});
  resetUi();
}

export async function hangupCall() {
  stopRinging();
  const ref = activeCall?.ref || pendingIncoming?.ref;
  if (ref) await updateDoc(ref, { status: "ended", endedBy: auth.currentUser?.uid || "", updatedAt: serverTimestamp() }).catch(() => {});
  resetUi();
}

function watchIncoming() {
  unsubscribeIncoming?.();
  const user = auth.currentUser;
  if (!user) return;
  const handle = async snap => {
    if (activeCall || pendingIncoming) return;
    const items = snap.docs.map(d => ({ ref:d.ref, data:d.data() })).filter(item => item.data.status === "ringing");
    items.sort((a,b)=>(b.data.createdAt?.toMillis?.()||0)-(a.data.createdAt?.toMillis?.()||0));
    const ringing = items[0];
    if (!ringing) return;
    const created = ringing.data.createdAt?.toMillis?.() || Date.now();
    if (Date.now() - created > 120000) {
      if (ringing.data.calleeUid === user.uid) updateDoc(ringing.ref,{status:"rejected",updatedAt:serverTimestamp()}).catch(()=>{});
      return;
    }
    const callerSnap = await getDoc(doc(db, "publicProfiles", ringing.data.callerUid)).catch(() => null);
    const peer = callerSnap?.exists?.() ? { uid:ringing.data.callerUid, ...callerSnap.data() } : { uid:ringing.data.callerUid, name:"Gamer" };
    pendingIncoming = ringing;
    setCallPerson(peer, true);
    $("callAccept") && ($("callAccept").hidden = false);
    $("callReject") && ($("callReject").hidden = false);
    $("callHangup") && ($("callHangup").hidden = true);
    $("callCamera") && ($("callCamera").hidden = ringing.data.type !== "video");
    $("callVideoStage") && ($("callVideoStage").hidden = true);
    setStatus(ringing.data.type === "video" ? "Chamada de vídeo" : "Chamada de voz", "ring");
    showDialog();
    await startRinging("incoming");
  };
  const primary = query(collection(db,"calls"),where("calleeUid","==",user.uid),orderBy("createdAt","desc"),limit(10));
  unsubscribeIncoming = onSnapshot(primary,handle,error=>{
    console.warn("incoming calls indexed query",error);
    if (error?.code === "failed-precondition") {
      unsubscribeIncoming?.();
      const fallback=query(collection(db,"calls"),where("calleeUid","==",user.uid));
      unsubscribeIncoming=onSnapshot(fallback,handle,fallbackError=>console.warn("incoming calls fallback",fallbackError));
    }
  });
}

async function beginScreenShare() {
  if (!pc || !activeCall) return notify("Inicie uma ligação antes de compartilhar a tela.");
  if (!navigator.mediaDevices?.getDisplayMedia) return notify("Seu navegador não oferece compartilhamento de tela.");
  if (screenStream) return stopScreenShare();
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video:{ width:{ideal:1920}, height:{ideal:1080}, frameRate:{ideal:30,max:30} },
      audio:true,
      selfBrowserSurface:"exclude",
      surfaceSwitching:"include",
      systemAudio:"include"
    });
    const screenTrack = screenStream.getVideoTracks()[0];
    if (!screenTrack) throw new Error("SCREEN_TRACK_REQUIRED");
    screenTrack.contentHint = "detail";
    const sender = currentVideoSender || pc.getSenders().find(item => item.track?.kind === "video") || pc.getTransceivers().find(item => item.receiver?.track?.kind === "video")?.sender;
    if (!sender) throw new Error("VIDEO_SENDER_REQUIRED");
    currentVideoSender = sender;
    await sender.replaceTrack(screenTrack);

    // Se o navegador fornecer áudio do sistema, mistura com o microfone em uma única trilha.
    const screenAudio = screenStream.getAudioTracks()[0];
    const micTrack = localStream?.getAudioTracks?.()[0];
    const audioSender = pc.getSenders().find(item => item.track?.kind === "audio") || pc.__sgAudioSender;
    if (screenAudio && micTrack && audioSender) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (Context) {
        mixedAudioContext = new Context();
        await mixedAudioContext.resume().catch(()=>{});
        const destination = mixedAudioContext.createMediaStreamDestination();
        const micSource = mixedAudioContext.createMediaStreamSource(new MediaStream([micTrack]));
        const screenSource = mixedAudioContext.createMediaStreamSource(new MediaStream([screenAudio]));
        const micGain = mixedAudioContext.createGain(); micGain.gain.value = 1;
        const screenGain = mixedAudioContext.createGain(); screenGain.gain.value = .75;
        micSource.connect(micGain).connect(destination);
        screenSource.connect(screenGain).connect(destination);
        originalAudioSenderTrack = micTrack;
        await audioSender.replaceTrack(destination.stream.getAudioTracks()[0]);
      }
    }

    if ($("localVideo")) {
      $("localVideo").srcObject = new MediaStream([screenTrack]);
      $("localVideo").play?.().catch(()=>{});
    }
    if ($("callVideoStage")) $("callVideoStage").hidden = false;
    $("callShare")?.classList.add("active");
    $("callDialog")?.classList.add("screen-sharing");
    setStatus(screenAudio ? "Compartilhando tela + áudio" : "Compartilhando sua tela", "ok");
    screenTrack.onended = () => stopScreenShare("Compartilhamento encerrado").catch(()=>{});
  } catch (error) {
    console.warn("screen share", error);
    if (error?.name !== "NotAllowedError") notify("Não foi possível compartilhar a tela. Verifique a permissão do navegador.");
    if (screenStream) screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }
}

export function getActiveCallAudioStream() {
  const track = localStream?.getAudioTracks?.()[0];
  if (!activeCall || !track || track.readyState !== "live") return null;
  try {
    const clone = track.clone();
    clone.enabled = true;
    return new MediaStream([clone]);
  } catch {
    return null;
  }
}

export function refreshCallAvailability() {
  renderButtons();
}

export function initCalls(options = {}) {
  if (initialized) { renderButtons(); return; }
  initialized = true;
  getPeer = options.getPeer || getPeer;
  canCall = options.canCall || canCall;
  notify = options.notify || notify;
  document.addEventListener("pointerdown", primeAudio, { once:true, capture:true });
  $("audioCallButton")?.addEventListener("click", () => startCall("audio"));
  $("videoCallButton")?.addEventListener("click", () => startCall("video"));
  $("callAccept")?.addEventListener("click", acceptIncoming);
  $("callReject")?.addEventListener("click", rejectIncoming);
  $("callHangup")?.addEventListener("click", hangupCall);
  $("callMute")?.addEventListener("click", () => {
    const track = localStream?.getAudioTracks?.()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    $("callMute").classList.toggle("off", !track.enabled);
    $("callMute").setAttribute("aria-pressed", String(!track.enabled));
    $("callMute").title = track.enabled ? "Desativar microfone" : "Ativar microfone";
  });
  $("callCamera")?.addEventListener("click", () => {
    const track = localStream?.getVideoTracks?.()[0];
    if (!track) return notify("A câmera não está ativa nesta chamada.");
    track.enabled = !track.enabled;
    $("callCamera").classList.toggle("off", !track.enabled);
    $("callCamera").setAttribute("aria-pressed", String(!track.enabled));
  });
  $("callShare")?.addEventListener("click", beginScreenShare);
  $("callFullscreen")?.addEventListener("click", async () => {
    const stage = $("callVideoStage");
    if (!stage || stage.hidden) return notify("Ative o vídeo ou compartilhe a tela para usar tela cheia.");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.requestFullscreen?.();
    } catch { notify("O navegador não permitiu abrir em tela cheia."); }
  });
  $("callMinimize")?.addEventListener("click", () => {
    $("callDialog")?.classList.toggle("minimized");
    updateDock();
  });
  $("callOpenChat")?.addEventListener("click", () => {
    $("callDialog")?.classList.add("minimized");
    $("messageInput")?.focus();
    updateDock();
  });
  $("callDockOpen")?.addEventListener("click", () => {
    $("callDialog")?.classList.remove("minimized");
    showDialog();
  });
  $("callDockHangup")?.addEventListener("click", hangupCall);
  watchIncoming();
  getTurnIceServers(false).catch(()=>{});
  renderButtons();
}
