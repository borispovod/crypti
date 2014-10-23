var Transaction = function (id, type, timestamp, senderPublicKey, recipientId, amount, signature, asset, secondSignature) {
    this.id = id;
    this.type = type;
    this.timestamp = timestamp;
    this.senderPublicKey = senderPublicKey;
    this.recipientId = recipientId;
    this.amount = amount;
    this.signature = signature;
    this.asset = asset;
    this.secondSignature = secondSignature;

    this.getBytes = function () {

    }

    this.sign = function () {

    }

    this.verify = function () {

    }

    this.signSecondSignature = function () {

    }

    this.verifySecondSignature = function () {

    }

    this.getHash = function () {

    }

    this.getSize = function () {

    }

    this.setBlockId = function () {

    }
}



