var os = require("os");

//private
var modules, library

var version,
    osName,
    port;

//public

// our system information to connect with peers
function System(cb, scope) {
    library = scope;

    version = library.config.version;
    port = library.config.port;
    osName = os.platform() + os.release();

    setImmediate(cb);
}

System.prototype.getOS = function () {
    return os;
}

System.prototype.getVersion = function () {
    return version;
}

System.prototype.getPort = function () {
    return port;
}

System.prototype.run = function (cb, scope) {
    modules = scope;
    setImmediate(cb);
}