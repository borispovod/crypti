var os = require("os");

//private fields
var modules, library, self, private;

var version, osName, port, sharePort;

//constructor
function System(cb, scope) {
	library = scope;
	self = this;

	version = library.config.version;
	port = library.config.port;
	sharePort = Number(!!library.config.sharePort);
    osName = os.platform() + os.release();

	setImmediate(cb, null, self);
}

//public methods
System.prototype.getOS = function () {
    return osName;
}

System.prototype.getVersion = function () {
    return version;
}

System.prototype.getPort = function () {
    return port;
}

System.prototype.getSharePort = function(){
	return sharePort;
}

//events
System.prototype.onBind = function (scope) {
	modules = scope;
}

//export
module.exports = System;