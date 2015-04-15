require('angular');
var platform = require("platform");
var crypti = require('crypti-js');

angular.module('webApp').service('transactionService', function (userService) {

    this.checkTransaction = function (transaction, secret) {

        var keys = crypti.crypto.getKeys(secret);
        var address = crypti.crypto.getAddress(keys.publicKey);

        if (userService.address != address) {
            return {
                err: true,
                message: "Invalid account password. Please try again"
            }
        }

        if (secret.length == 0) {
            return {
                err: true,
                message: "Provide secret key"
            }
        }

        if (keys.publicKey) {
            if (keys.publicKey != transaction.senderPublicKey) {
                return {
                    err: true,
                    message: "Invalid account primary password. Try again"
                }
            }
        }

        if (!userService.balance) {
            return {
                err: true,
                message: "Account doesn't has balance"
            }
        }

        if (!userService.publicKey) {
            return {
                err: true,
                message: "Open account to make transaction"
            }
        }

        return {err: false}

    }

    this.createHeaders = function (timeout) {
        var data = {
            "headers": {
                "os": platform.os.toString(),
                "version": "0.2.0Lite!",
                "port": 0,
                "share-port": false
            }};
        if (timeout) {
            data["timeout"] = timeout;
        }
        return data;
    }


})
;