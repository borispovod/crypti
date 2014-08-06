var http = require('http'),
    keepAliveAgent = require('keep-alive-agent'),
    _ = require('underscore');

var peer = function (address, port, platform, version) {
    this.ip = address;
    this.port = port;
    this.version = version;
    this.state = 0;
    this.shareAddress = true;
    this.platform = "";
    this.version =  1;
    //this.timestamp = timestamp;
    //this.publicKey = publicKey;
    //this.blocked = blocked;
    this.downloadedVolume = 0;
    this.uploadedVolume = 0;
    this.blacklistedTime = 0;
    this.agent = null;
    this.app = null;
}

peer.prototype.setApp = function (app) {
    this.app = app;
    this._version = app.info.version;
    this._platform = app.info.platform;
}

peer.prototype.setState = function (state) {
    this.state = state;
}

peer.prototype.getUploadedVolume = function () {
    return this.uploadedVolume;
}

peer.prototype.getDownloadedVolume = function () {
    this.downloadedVolume;
}

peer.prototype.updateDownloadedVolume = function (downloaded) {
    this.downloadedVolume += downloaded;
}

peer.prototype.updateUploadedVolume = function (uploaded) {
    this.uploadedVolume += uploaded;
}

peer.prototype.isBlacklisted = function () {
    return (this.blacklistedTime > 0 && this.state == 3);
}

peer.prototype.setBlacklisted = function (blacklisted) {
    if (blacklisted) {
        this.blacklistedTime = new Date().getTime();
        this.state = 3;
    } else {
        this.blacklistedTime = 0;
        this.state = 0;
    }
}

peer.prototype.checkBlacklisted = function () {
    if (this.blacklistedTime > 0) {

        if (this.blacklistedTime + 1000 * 60 * 10 < new Date().getTime()) {
            this.blacklistedTime = 0;
            this.state = 0;
            return false;
        }

        return true;
    } else {
        this.state = 3;
        return false;
    }
}

peer.prototype.setShare = function (share) {
    this.shareAddress = share;
}

peer.prototype.checkAgent = function () {
    if (!this.agent) {
        this.agent = new keepAliveAgent;
    }
}

peer.prototype.getPeers = function (cb) {
    this.checkAgent();

    var getOptions = {
        hostname: this.ip,
        port: this.port,
        path: '/peer/getPeers',
        //agent: this.agent,
        headers: {
            "platform" : this._platform,
            "version" : this._version
        }
    };
    var timeout = null;

    var r = http.get(getOptions, function (res) {
        var data = "";
        res.on("data", function(body) {
            clearTimeout(timeout);
            data += body;
        });
        res.on('end', function () {
            cb(null, data);
        });
    });

    timeout = setTimeout(function () {
        r.abort();
    }, 5000);

    r.on('error', function (err) {
        cb(err, null);
    });
}

peer.prototype.getPeer = function (ip, cb) {
    this.checkAgent();

    var getOptions = {
        hostname: this.ip,
        port: this.port,
        path: '/peer/getPeer?ip=' + ip,
        //agent: this.agent,
        headers: {
            "platform" : this._platform,
            "version" : this._version
        }
    };

    var timeout = null;

    var r = http.get(getOptions, function (res) {
        var data = "";
        res.on("data", function(body) {
            clearTimeout(timeout);
            data += body;
        });
        res.on('end', function () {
            cb(null, data);
        });
    });

    timeout = setTimeout(function () {
        r.abort();
    }, 5000);

    r.on('error', function (err) {
        cb(err, null);
    });
}

peer.prototype.getInfo = function (cb) {
    this.checkAgent();

    var getOptions = {
        hostname: this.ip,
        port: this.port,
        path: '/peer/getInfo',
        //agent: this.agent,
        headers: {
            "platform" : this._platform,
            "version" : this._version
        }
    };

    var timeout = null;

    var r = http.get(getOptions, function (res) {
        var data = "";
        res.on("data", function(body) {
            clearTimeout(timeout);
            data += body;
        });
        res.on('end', function () {
            cb(null, data);
        });
    });

    timeout = setTimeout(function () {
        r.abort();
    }, 5000);

    r.on('error', function (err) {
        cb(err, null);
    });
}

peer.prototype.getInfo = function (cb) {
    this.checkAgent();

    var getOptions = {
        hostname: this.ip,
        port: this.port,
        path: '/peer/getInfo',
        //agent: this.agent,
        headers: {
            "platform" : this._platform,
            "version" : this._version
        }
    };

    var timeout = null;

    var r = http.get(getOptions, function (res) {
        var data = "";
        res.on("data", function(body) {
            clearTimeout(timeout);
            data += body;
        });
        res.on('end', function () {
            cb(null, data);
        });
    });

    timeout = setTimeout(function () {
        r.abort();
    }, 5000);

    r.on('error', function (err) {
        cb(err, null);
    });
}

peer.prototype.getCumulativeDifficulty = function (cb) {
    this.checkAgent();

    var getOptions = {
        hostname: this.ip,
        port: this.port,
        path: '/peer/getCumulativeDifficulty',
        ///agent: this.agent,
        headers: {
            "platform" : this._platform,
            "version" : this._version
        }
    };

    var timeout = null;

    var r = http.get(getOptions, function (res) {
        var data = "";
        res.on("data", function(body) {
            clearTimeout(timeout);
            data += body;
        });
        res.on('end', function () {
            cb(null, data);
        });
    });

    timeout = setTimeout(function () {
        r.abort();
    }, 5000);

    r.on('error', function (err) {
        cb(err, null);
    });
}


peer.prototype.getNextBlockIds = function (blockId, cb) {
    this.checkAgent();

    var getOptions = {
        hostname: this.ip,
        port: this.port,
        path: '/peer/getNextBlockIds?blockId=' + blockId,
        //agent: this.agent,
        headers: {
            "platform" : this._platform,
            "version" : this._version
        }
    };

    var timeout = null;

    var r = http.get(getOptions, function (res) {
        var data = "";
        res.on("data", function(body) {
            clearTimeout(timeout);
            data += body;
        });
        res.on('end', function () {
            cb(null, data);
        });
    });

    timeout = setTimeout(function () {
        r.abort();
    }, 5000);

    r.on('error', function (err) {
        cb(err, null);
    });
}

peer.prototype.getNextBlocks = function (blockId, cb) {
    this.checkAgent();

    var getOptions = {
        hostname: this.ip,
        port: this.port,
        path: '/peer/getNextBlocks?blockId=' + blockId,
        ///agent: this.agent,
        headers: {
            "platform" : this._platform,
            "version" : this._version
        }
    };

    var timeout = null;

    var r = http.get(getOptions, function (res) {
        var data = "";
        res.on("data", function(body) {
            clearTimeout(timeout);
            data += body;
        });
        res.on('end', function () {
            cb(null, data);
        });
    });

    timeout = setTimeout(function () {
        r.abort();
    }, 5000);

    r.on('error', function (err) {
        cb(err, null);
    });
}

peer.prototype.getUnconfirmedAddresses = function (cb) {
    this.checkAgent();

    var getOptions = {
        hostname: this.ip,
        port: this.port,
        path: '/peer/getUnconfirmedAddresses',
        //agent: this.agent,
        headers: {
            "platform" : this._platform,
            "version" : this._version
        }
    };

    var timeout = null;

    var r = http.get(getOptions, function (res) {
        var data = "";
        res.on("data", function(body) {
            clearTimeout(timeout);
            data += body;
        });
        res.on('end', function () {
            cb(null, data);
        });
    });

    timeout = setTimeout(function () {
        r.abort();
    }, 5000);

    r.on('error', function (err) {
        cb(err, null);
    });
}

peer.prototype.getUnconfirmedTransactions = function (cb) {
    this.checkAgent();

    var getOptions = {
        hostname: this.ip,
        port: this.port,
        path: '/peer/getUnconfirmedTransactions',
        //agent: this.agent,
        headers: {
            "platform" : this._platform,
            "version" : this._version
        }
    };

    var timeout = null;

    var r = http.get(getOptions, function (res) {
        var data = "";
        res.on("data", function(body) {
            clearTimeout(timeout);
            data += body;
        });
        res.on('end', function () {
            cb(null, data);
        });
    });

    timeout = setTimeout(function () {
        r.abort();
    }, 5000);

    r.on('error', function (err) {
        cb(err, null);
    });
}

peer.prototype.processBlock = function (block, cb) {
    var b = block.toJSON();
    var transactions = [];

    for (var i = 0; i < block.transactions.length; i++) {
        transactions.push(block.transactions[i].toJSON());
    }

    var addresses = [];
    for (var a in b.addresses) {
        addresses.push(block.addresses[a].toJSON());
    }

    var requests = [];
    for (var r in b.requests) {
        requests.push(b.requests[r].toJSON());
    }

    var signatures = [];
    for (var i = 0; i < b.signatures.length; i++) {
        signatures.push(b.signatures[i].toJSON());
    }

    b.requests = requests;
    b.transactions = transactions;
    b.addresses = addresses;
    b.signatures = signatures;

    var getOptions = {
        hostname: this.ip,
        port: this.port,
        path: '/peer/processBlock?block=' + JSON.stringify(b),
        //agent: this.agent,
        headers: {
            "platform" : this._platform,
            "version" : this._version
        }
    };

    var timeout = null;

    var r = http.get(getOptions, function (res) {
        var data = "";
        res.on("data", function(body) {
            clearTimeout(timeout);
            data += body;
        });
        res.on('end', function () {
            cb(null, data);
        });
    });

    timeout = setTimeout(function () {
        r.abort();
    }, 5000);

    r.on('error', function (err) {
        cb(err, null);
    });
}

peer.prototype.processUnconfirmedTransaction = function (transaction, cb) {
    var t = transaction.toJSON();

    this.checkAgent();

    var getOptions = {
        hostname: this.ip,
        port: this.port,
        path: '/peer/processUnconfirmedTransaction?transaction=' + JSON.stringify(t),
        //agent: this.agent,
        headers: {
            "platform" : this._platform,
            "version" : this._version
        }
    };

    var timeout = null;

    var r = http.get(getOptions, function (res) {
        var data = "";
        res.on("data", function(body) {
            clearTimeout(timeout);
            data += body;
        });
        res.on('end', function () {
            cb(null, data);
        });
    });

    timeout = setTimeout(function () {
        r.abort();
    }, 5000);

    r.on('error', function (err) {
        cb(err, null);
    });
}

peer.prototype.getRequests = function (cb) {
    this.checkAgent();

    var getOptions = {
        hostname: this.ip,
        port: this.port,
        path: '/peer/getRequests',
        //agent: this.agent,
        headers: {
            "platform" : this._platform,
            "version" : this._version
        }
    };

    var timeout = null;

    var r = http.get(getOptions, function (res) {
        var data = "";
        res.on("data", function(body) {
            clearTimeout(timeout);
            data += body;
        });
        res.on('end', function () {
            cb(null, data);
        });
    });

    timeout = setTimeout(function () {
        r.abort();
    }, 5000);

    r.on('error', function (err) {
        cb(err, null);
    });
}

peer.prototype.sendRequest = function (request, cb) {
    this.checkAgent();


    var getOptions = {
        hostname: this.ip,
        port: this.port,
        path: '/peer/alive?&request=' + JSON.stringify(request.toJSON()),
        //agent: this.agent,
        headers: {
            "platform" : this._platform,
            "version" : this._version
        }
    };

    var timeout = null;

    var r = http.get(getOptions, function (res) {
        var data = "";
        res.on("data", function(body) {
            clearTimeout(timeout);
            data += body;
        });
        res.on('end', function () {
            console.log(data);
            cb(null, data);
        });
    });

    timeout = setTimeout(function () {
        r.abort();
    }, 5000);

    r.on('error', function (err) {
        cb(err, null);
    });
}

peer.prototype.processUnconfirmedAddress = function (address, cb) {
    var a = address.toJSON();

    this.checkAgent();

    var getOptions = {
        hostname: this.ip,
        port: this.port,
        path: '/peer/processUnconfirmedAddress?address=' + JSON.stringify(a),
        //agent: this.agent,
        headers: {
            "platform" : this._platform,
            "version" : this._version
        }
    };

    var timeout = null;

    var r = http.get(getOptions, function (res) {
        var data = "";
        res.on("data", function(body) {
            clearTimeout(timeout);
            data += body;
        });
        res.on('end', function () {
            cb(null, data);
        });
    });

    timeout = setTimeout(function () {
        r.abort();
    }, 5000);

    r.on('error', function (err) {
        cb(err, null);
    });
}

peer.prototype.sendHello = function (params, cb) {


    var getOptions = {
        hostname: this.ip,
        port: this.port,
        path: '/peer/hello?params=' + JSON.stringify(params),
        //agent: this.agent,
        headers: {
            "platform" : this._platform,
            "version" : this._version
        }
    };

    var timeount = null;
    var self = this;
    var r = http.get(getOptions, function (res) {
        var data = "";
        res.on("data", function(body) {
            clearTimeout(timeout);
            data += body;
        });
        res.on('end', function () {
            if (cb) {
                //cb(null, data);
            }

            var json = null;

            try {
                json = JSON.parse(data);
            } catch (e) {
                return;
            }

            if (json.forger) {
                self.timestamp = json.forger.timestamp;
                self.publicKey = json.forger.publicKey;
            }
        });
    });

    timeout = setTimeout(function () {
        r.abort();
    }, 5000);

    r.on('error', function (err) {
        if (cb) {
            cb(err, null);
        }
    });
}

module.exports = peer;