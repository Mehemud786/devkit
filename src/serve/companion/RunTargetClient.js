var util = require('util');
var CompanionSocketClient = require('./CompanionSocketClient');


/**
 * @param  {String}  [opts.UUID]
 * @param  {String}  [opts.status='unavailable'] available, unavailable, occupied
 */
var RunTargetClient = function(opts) {
  CompanionSocketClient.call(this, opts);

  this.UUID = opts.UUID || null;
  this.status = opts.status || 'unavailable';

  this.name = opts.name || 'noname';
};
util.inherits(RunTargetClient, CompanionSocketClient);
var supr = CompanionSocketClient.prototype;


RunTargetClient.prototype.setSocket = function(socket) {
  supr.setSocket.call(this, socket);

  if (this.socket) {
    // Add the socket listeners
    this.on('clientInfo', this.onClientInfo.bind(this));
    this.status = 'available';
  } else {
    this.status = 'unavailable';
  }

  // Let the server know that this run target has been updated
  this._server.updateRunTarget(this);
};

/** RunTargets are not ready immediately, they must recieve ID info from the client first */
RunTargetClient.prototype.isReady = function() {
  return this.UUID !== null;
};

/**
 * @param  {String} appPath
 */
RunTargetClient.prototype.run = function(requestor, appPath) {
  if (this.status === 'unavailable') {
    if (requestor) {
      requestor._error('run_target_not_available');
    } else {
      this._logger.error('cannot stop, run target unavailable');
    }
    return;
  }

  this.send('run', {
    appPath: appPath
  });
};

RunTargetClient.prototype.stop = function(requestor) {
  if (this.status === 'unavailable') {
    if (requestor) {
      requestor._error('run_target_not_available');
    } else {
      this._logger.error('cannot stop, run target unavailable');
    }
    return;
  }

  this.send('stop');
};

/**
 * @param  {Object}  message
 * @param  {String}  message.UUID
 * @param  {String}  [message.name]
 */
RunTargetClient.prototype.onClientInfo = function(message) {
  if (!message.UUID) {
    this._criticalError('missing_UUID', 'onClientInfo: requires message.UUID');
    return;
  }

  // Check for an existing client with this UUID
  var existingClient = this._server.getRunTarget(message.UUID);
  if (existingClient) {
    // If it is an active client, throw an error
    if (existingClient.socket) {
      this._criticalError('UUID_collision', 'onClientInfo: message.UUID not unique: ' + message.UUID);
      return;
    }
    // Otherwise merge data with the existing client, and then remove the temporary entry from server memory
    this.name = existingClient.name;
    this._server.removeRunTargetClient(existingClient, {
      onlyInMemory: true
    });
  }

  this.UUID = message.UUID;
  if (message.name) {
    this.name = message.name;
  }

  this._server.saveRunTarget(this);
  this._server.updateRunTarget(this, !existingClient);
};

RunTargetClient.prototype.onDisconnect = function() {
  this._logger.log('RunTargetClient disconnected', this.UUID);
  this.setSocket(null);
};

/** Get the info object to send to ui */
RunTargetClient.prototype.toInfoObject = function() {
  return {
    UUID: this.UUID,
    name: this.name,
    status: this.status
  };
};

/** Get the object containing data to be persisted between saves */
RunTargetClient.prototype.toObject = function() {
  return {
    UUID: this.UUID,
    name: this.name
  };
};

RunTargetClient.fromObject = function(server, logger, obj) {
  return new RunTargetClient({
    server: server,
    logger: logger,
    UUID: obj.UUID,
    name: obj.name
  });
};

module.exports = RunTargetClient;