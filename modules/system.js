var os = require("os");

//private fields
var modules, library, self, private = {};

private.version, private.osName, private.port, private.sharePort;

//constructor
function System(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;

	private.version = library.config.version;
	private.port = library.config.port;
	private.sharePort = Number(!!library.config.sharePort);
	private.osName = os.platform() + os.release();

	setImmediate(cb, null, self);
}

//public methods
System.prototype.getOS = function () {
	return private.osName;
}

System.prototype.getVersion = function () {
	return private.version;
}

System.prototype.getPort = function () {
	return private.port;
}

System.prototype.getSharePort = function () {
	return private.sharePort;
}

//events
System.prototype.onBind = function (scope) {
	modules = scope;
}

//export
module.exports = System;