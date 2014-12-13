var os = require("os");

//private
var modules, library, self;

var version,
    osName,
    port,
	sharePort;


//constructor
function System(cb, scope) {
	library = scope;
	self = this;

	version = library.config.version;
	port = library.config.port;
	sharePort = Number(!!library.config.sharePort);
    osName = os.platform() + os.release();

	cb(null, this);
}
//public
System.prototype.run = function (scope) {
	modules = scope;
}

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

//export
module.exports = System;