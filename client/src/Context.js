import React, { createContext, useState, useRef, useEffect } from "react";
import { io } from "socket.io-client";
import Peer from "simple-peer";

// ✅ Create a Context to share socket and video call states globally
const SocketContext = createContext();

// ✅ Use an environment variable for the backend URL, with a fallback URL if not set
const socket = io(
  process.env.REACT_APP_BACKEND_URL || "https://your-backend-url.onrender.com",
  {
    transports: ["websocket"], // Force WebSocket to avoid polling issues
  }
);

const ContextProvider = ({ children }) => {
  // ✅ State variables to manage call, user info, and media stream
  const [callAccepted, setCallAccepted] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [stream, setStream] = useState(null);
  const [name, setName] = useState(""); // Store user's name
  const [call, setCall] = useState({}); // Store call details
  const [me, setMe] = useState(""); // Store current user’s socket ID

  // ✅ Refs for video elements and connection
  const myVideo = useRef(); // Local user’s video
  const userVideo = useRef(); // Remote user’s video
  const connectionRef = useRef(); // WebRTC connection instance

  useEffect(() => {
    // ✅ Request access to webcam and microphone
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((currentStream) => {
        setStream(currentStream);
        if (myVideo.current) {
          myVideo.current.srcObject = currentStream;
        }
      })
      .catch((error) => {
        console.error("Error accessing media devices:", error);
      });

    // ✅ Listen for socket events
    socket.on("me", (id) => setMe(id)); // Store the user's socket ID
    socket.on("callUser", ({ from, name: callerName, signal }) => {
      setCall({ isReceivingCall: true, from, name: callerName, signal });
    });

    // ✅ Cleanup on unmount to avoid memory leaks
    return () => {
      socket.off("me");
      socket.off("callUser");
    };
  }, []);

  // ✅ Function to answer an incoming call
  const answerCall = () => {
    setCallAccepted(true);

    // Create a new WebRTC peer connection
    const peer = new Peer({ initiator: false, trickle: false, stream });

    // When the peer generates a signal, send it to the caller
    peer.on("signal", (data) => {
      socket.emit("answerCall", { signal: data, to: call.from });
    });

    // Receive and display the remote video stream
    peer.on("stream", (currentStream) => {
      if (userVideo.current) {
        userVideo.current.srcObject = currentStream;
      }
    });

    // Accept the caller's signal and establish the connection
    peer.signal(call.signal);
    connectionRef.current = peer;
  };

  // ✅ Function to initiate a call to another user
  const callUser = (id) => {
    const peer = new Peer({ initiator: true, trickle: false, stream });

    // Send the caller's WebRTC signal to the target user
    peer.on("signal", (data) => {
      socket.emit("callUser", {
        userToCall: id,
        signalData: data,
        from: me,
        name,
      });
    });

    // Receive and display the remote video stream
    peer.on("stream", (currentStream) => {
      if (userVideo.current) {
        userVideo.current.srcObject = currentStream;
      }
    });

    // When the call is accepted, connect the WebRTC streams
    socket.on("callAccepted", (signal) => {
      setCallAccepted(true);
      peer.signal(signal);
    });

    connectionRef.current = peer;
  };

  // ✅ Function to leave the call
  const leaveCall = () => {
    setCallEnded(true);

    // Destroy the WebRTC connection
    if (connectionRef.current) {
      connectionRef.current.destroy();
    }

    // Reload the page to reset the state
    window.location.reload();
  };

  return (
    <SocketContext.Provider
      value={{
        call,
        callAccepted,
        myVideo,
        userVideo,
        stream,
        name,
        setName,
        callEnded,
        me,
        callUser,
        leaveCall,
        answerCall,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export { ContextProvider, SocketContext };
