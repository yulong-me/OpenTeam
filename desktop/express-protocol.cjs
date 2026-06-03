const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');

const STREAM_METHODS = [
  'on',
  'once',
  'emit',
  'pipe',
  'read',
  'resume',
  'pause',
  'unpipe',
  'destroy',
  'setEncoding',
  'removeListener',
  'removeAllListeners',
];

function normalizeHeaders(requestHeaders, bodyLength) {
  const headers = {};
  requestHeaders.forEach((value, key) => {
    if (!['host', 'connection'].includes(key.toLowerCase())) {
      headers[key] = value;
    }
  });
  if (bodyLength > 0 && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-length')) {
    headers['content-length'] = String(bodyLength);
  }
  return headers;
}

function createProtocolRequest(request, body) {
  const url = new URL(request.url);
  const req = Readable.from(body);

  for (const method of STREAM_METHODS) {
    if (typeof req[method] === 'function') {
      req[method] = req[method].bind(req);
    }
  }

  req.method = request.method;
  req.url = `${url.pathname}${url.search}`;
  req.originalUrl = req.url;
  req.headers = normalizeHeaders(request.headers, body.length);
  req.socket = req;
  req.connection = req;
  req.remoteAddress = '127.0.0.1';
  req.httpVersion = '1.1';
  req.on('error', () => undefined);

  return req;
}

function appendHeader(headers, name, value) {
  if (Array.isArray(value)) {
    for (const item of value) headers.append(name, String(item));
    return;
  }
  headers.set(name, String(value));
}

function createProtocolResponse(resolve, req) {
  const emitter = new EventEmitter();
  const headerMap = new Map();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  let responseStarted = false;
  let responseClosed = false;

  const responseHeaders = () => {
    const headers = new Headers();
    for (const [name, value] of headerMap.entries()) appendHeader(headers, name, value);
    return headers;
  };

  const startResponse = () => {
    if (responseStarted) return;
    responseStarted = true;
    res.headersSent = true;
    resolve(new Response(stream.readable, {
      status: res.statusCode || 200,
      statusText: res.statusMessage || undefined,
      headers: responseHeaders(),
    }));
  };

  const closeResponse = () => {
    if (responseClosed) return;
    responseClosed = true;
    res.finished = true;
    res.writableEnded = true;
    res.headersSent = true;
    writer.close().catch(() => undefined);
    emitter.emit('finish');
    emitter.emit('close');
  };

  const res = {
    statusCode: 200,
    statusMessage: undefined,
    locals: {},
    req,
    socket: req.socket,
    connection: req.connection,
    finished: false,
    headersSent: false,
    writable: true,
    writableEnded: false,
    setHeader(name, value) {
      headerMap.set(String(name).toLowerCase(), value);
      return this;
    },
    getHeader(name) {
      return headerMap.get(String(name).toLowerCase());
    },
    getHeaders() {
      return Object.fromEntries(headerMap);
    },
    getHeaderNames() {
      return Array.from(headerMap.keys());
    },
    hasHeader(name) {
      return headerMap.has(String(name).toLowerCase());
    },
    removeHeader(name) {
      headerMap.delete(String(name).toLowerCase());
    },
    writeHead(statusCode, statusMessageOrHeaders, maybeHeaders) {
      this.statusCode = statusCode;
      let headers = maybeHeaders;
      if (typeof statusMessageOrHeaders === 'string') {
        this.statusMessage = statusMessageOrHeaders;
      } else {
        headers = statusMessageOrHeaders;
      }
      if (headers) {
        for (const [name, value] of Object.entries(headers)) this.setHeader(name, value);
      }
      startResponse();
      return this;
    },
    _implicitHeader() {
      if (!this.headersSent) this.writeHead(this.statusCode || 200);
    },
    write(chunk, encoding, callback) {
      startResponse();
      if (chunk !== undefined && chunk !== null) {
        const buffer = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk, typeof encoding === 'string' ? encoding : undefined);
        writer.write(buffer).catch(() => undefined);
      }
      if (typeof encoding === 'function') encoding();
      if (typeof callback === 'function') callback();
      return true;
    },
    end(chunk, encoding, callback) {
      startResponse();
      if (chunk !== undefined && chunk !== null) this.write(chunk, encoding);
      if (typeof encoding === 'function') encoding();
      if (typeof callback === 'function') callback();
      closeResponse();
      return this;
    },
    flushHeaders() {
      startResponse();
    },
    cork() {},
    uncork() {},
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    emit: emitter.emit.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
  };

  return res;
}

function createErrorResponse(error) {
  return new Response(`OpenTeam backend unavailable: ${error.message}`, {
    status: 502,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

function createExpressProtocolHandler(app) {
  return async function handleExpressProtocol(request) {
    const body = Buffer.from(await request.arrayBuffer());
    const req = createProtocolRequest(request, body);

    return new Promise((resolve) => {
      const res = createProtocolResponse(resolve, req);
      try {
        app(req, res);
      } catch (error) {
        resolve(createErrorResponse(error));
      }
    });
  };
}

exports.createExpressProtocolHandler = createExpressProtocolHandler;
