import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { log } from './log.js';
import { createBackendApp, initializeBackendRuntime } from './app.js';
import { initSocketEmitter } from './services/socketEmitter.js';

initializeBackendRuntime();

const app = createBackendApp();
const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// ── Socket.IO ───────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  log('INFO', 'socket:connect', { socketId: socket.id });
  socket.on('join-room', (roomId: string) => {
    socket.join(roomId);
    log('INFO', 'socket:join', { socketId: socket.id, roomId });
  });
  socket.on('leave-room', (roomId: string) => {
    socket.leave(roomId);
    log('INFO', 'socket:leave', { socketId: socket.id, roomId });
  });
  socket.on('disconnect', () => {
    log('INFO', 'socket:disconnect', { socketId: socket.id });
  });
});

// Initialize the socket emitter for use by stateMachine/routes
initSocketEmitter(io);

const BACKEND_PORT = parseInt(process.env.PORT || '7001', 10);
const BACKEND_HOST = process.env.BACKEND_HOST || '127.0.0.1';

httpServer.listen(BACKEND_PORT, BACKEND_HOST, () => {
  log('INFO', `Backend running on http://${BACKEND_HOST}:${BACKEND_PORT}`);
});
