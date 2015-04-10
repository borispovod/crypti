require('angular');
var platform = require("platform");
var crypti = require('crypti-js');

angular.module('webApp').service('transactionService', function (userService) {

    this.checkTransaction = function (transaction, secret) {

        var keys = crypti.crypto.getKeys(secret);
        var address = crypti.crypto.getAddress(keys.publicKey);

<<<<<<< HEAD
=======
        if (userService.address != address) {
            return {
                err: true,
                message: "Invalid account password. Please try again"
            }
        }

>>>>>>> 318e7a3217b5a4112c8bcee29560402a0b3d621e
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
                    message: "Please, provide valid secret key of your account"
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

    this.createHeaders = function () {
        return {
            "headers": {
                "os": platform.os.toString(),
<<<<<<< HEAD
                "version": "0.2.0light",
=======
                "version": "0.2.0Lite!",
>>>>>>> 318e7a3217b5a4112c8bcee29560402a0b3d621e
                "port": 0,
                "share-port": false
            }
        }
    }

});