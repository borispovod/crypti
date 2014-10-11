var http = require('http'),
    _ = require('underscore'),
    request = require('request');

var peer = function (address, port, version, sharePort) {
    this.ip = address;
    this.port = port;
    this.version = version;
    this.state = 0;
    this.sharePort = sharePort;
    this.platform = "";
    this.downloadedVolume = 0;
    this.uploadedVolume = 0;
    this.blacklistedTime = 0;
    this.agent = null;
    this.app = null;
    this.isNat = false;
}

peer.prototype.setApp = function (app) {
    this.app = app;
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
    /*if (!this.agent) {
        this.agent = new keepAliveAgent;
    }*/
}

peer.prototype.baseRequest = function (method, call, body, cb) {
    if (typeof body == "function") {
        cb = body;
        body = null;
    }

    request({
        url : "http://" + this.ip + ":" + this.port + call,
        method : method,
        timeout : 10000,
        json : body || true,
        headers : {
            "Content-Type" : "application/json",
            "Version" : this.app.get("config").get('version'),
            "User-Agent" : "Crypti Node",
            "SharePort" : this.app.get("config").get('sharePort')
        }
    }, cb);
}

peer.prototype.getPeers = function (cb) {
    this.baseRequest('GET', '/peer/getPeers', function (err, resp, body) {
        if (err || resp.statusCode != 200) {
            return cb(err || "Status code isn't 200");
        } else {
            cb(null, body);
        }
    });
}

peer.prototype.getPeer = function (ip, cb) {
    this.baseRequest('GET', '/peer/getPeer?ip=' + ip, function (err, resp, body) {
        if (err || resp.statusCode != 200) {
            return cb(err || "Status code isn't 200");
        } else {
            cb(null, body);
        }
    });
}

peer.prototype.getInfo = function (cb) {
    this.baseRequest('GET', '/peer/getInfo', function (err, resp, body) {
        if (err || resp.statusCode != 200) {
            return cb(err || "Status code isn't 200");
        } else {
            cb(null, body);
        }
    });
}

peer.prototype.getNextBlockIds = function (blockId, cb) {
    this.baseRequest('GET', '/peer/getNextBlockIds?blockId=' + blockId, function (err, resp, body) {
        if (err || resp.statusCode != 200) {
            return cb(err || "Status code isn't 200");
        } else {
            cb(null, body);
        }
    });
}

peer.prototype.getNextBlocks = function (blockId, cb) {
    this.baseRequest('GET', '/peer/getNextBlocks?blockId=' + blockId, function (err, resp, body) {
        if (err || resp.statusCode != 200) {
            return cb(err || "Status code isn't 200");
        } else {
            cb(null, body);
        }
    });
}

peer.prototype.getUnconfirmedTransactions = function (cb) {
    this.baseRequest('GET', '/peer/getUnconfirmedTransactions', function (err, resp, body) {
        if (err || resp.statusCode != 200) {
            return cb(err || "Status code isn't 200");
        } else {
            cb(null, body);
        }
    });
}

peer.prototype.processBlock = function (block, cb) {
    var b = block.toJSON();
    var transactions = [];

    for (var i = 0; i < block.transactions.length; i++) {
        transactions.push(block.transactions[i].toJSON());
    }

    var requests = [];
    for (var r in b.requests) {
        requests.push(b.requests[r].toJSON());
    }

    var confirmations = [];
    for (var i = 0; i < b.confirmations.length; i++) {
        confirmations.push(b.confirmations[i].toJSON());
    }

    var signatures = [];
    for (var i = 0; i < b.signatures.length; i++) {
        signatures.push(b.signatures[i].toJSON());
    }

    b.requests = requests;
    b.transactions = transactions;
    b.signatures = signatures;
    b.confirmations = confirmations;

    var json = {
        block: b
    };

    this.baseRequest('POST', '/peer/processBlock', json, function (err, resp, body) {
        if (err || resp.statusCode != 200) {
            return cb(err || "Status code isn't 200");
        } else {
            cb(null, body);
        }
    });
}

peer.prototype.processJSONBlock = function (b, cb) {
    var json = {
        block : b
    };

    this.baseRequest('POST', '/peer/processBlock', json, function (err, resp, body) {
        if (err || resp.statusCode != 200) {
            return cb(err || "Status code isn't 200");
        } else {
            cb(null, body);
        }
    });
}

peer.prototype.processUnconfirmedTransaction = function (transaction, cb) {
    var t = transaction.toJSON();


    this.baseRequest('GET', '/peer/processUnconfirmedTransaction?transaction=' + JSON.stringify(t), function (err, resp, body) {
        if (err || resp.statusCode != 200) {
            return cb(err || "Status code isn't 200");
        } else {
            cb(null, body);
        }
    });
}

peer.prototype.getMilestoneBlocks = function (lastBlock, lastMilestoneBlock, cb) {
    this.baseRequest('GET', '/peer/getMilestoneBlocks?lastBlock=' + lastBlock + "&lastMilestoneBlockId=" + lastMilestoneBlock, function (err, resp, body) {
        if (err || resp.statusCode != 200) {
            return cb(err || "Status code isn't 200");
        } else {
            return cb(null, body);
        }
    });
}

peer.prototype.getWeight = function (cb) {
    this.baseRequest('GET', '/peer/getWeight', function (err, resp, body) {
        if (err || resp.statusCode != 200) {
            return cb(err || "Status code isn't 200");
        } else {
            return cb(null, body);
        }
    });
}

peer.prototype.getRequests = function (cb) {
    this.baseRequest('GET', '/peer/getRequests', function (err, resp, body) {
        if (err || resp.statusCode != 200) {
            return cb(err || "Status code isn't 200");
        } else {
            return cb(null, body);
        }
    });
}

peer.prototype.sendRequest = function (request, cb) {
    this.baseRequest("GET", '/peer/alive?&request=' + JSON.stringify(request.toJSON()), function (err, resp, body) {
        if (err || resp.statusCode != 200) {
            return cb(err || "Status code isn't 200");
        } else {
            return cb(null, body);
        }
    });
}


module.exports = peer;