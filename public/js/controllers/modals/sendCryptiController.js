require('angular');

angular.module('webApp').controller('sendCryptiController', ["$scope", "sendCryptiModal", "$http", "userService", "$timeout", "peerFactory",
    function ($scope, sendCryptiModal, $http, userService, $timeout, peerFactory) {
        $scope.sending = false;
        $scope.accountValid = true;
        $scope.errorMessage = "";
        $scope.onlyNumbers = /^-?\d*(\.\d+)?$/;
        $scope.secondPassphrase = userService.secondPassphrase;
        $scope.address = userService.address;


        Number.prototype.roundTo = function (digitsCount) {
            var digitsCount = typeof digitsCount !== 'undefined' ? digitsCount : 2;
            var s = String(this);
            if (s.indexOf('e') < 0) {
                var e = s.indexOf('.');
                if (e == -1) return this;
                var c = s.length - e - 1;
                if (c < digitsCount) digitsCount = c;
                var e1 = e + 1 + digitsCount;
                var d = Number(s.substr(0, e) + s.substr(e + 1, digitsCount));
                if (s[e1] > 4) d += 1;
                d /= Math.pow(10, digitsCount);
                return d.valueOf();
            } else {
                return this.toFixed(digitsCount);
            }
        }

        Math.roundTo = function (number, digitsCount) {
            number = Number(number);
            return number.roundTo(digitsCount).valueOf();
        }

        $scope.close = function () {
            if ($scope.destroy) {
                $scope.destroy();
            }

            sendCryptiModal.deactivate();
        }

        $scope.moreThanEightDigits = function (number) {
            if (number.indexOf(".") < 0) {
                return false;
            }
            else {
                if (number.split('.')[1].length > 8) {
                    return true;
                }
                else {
                    return false;
                }
            }
        }

        $scope.recalculateFee = function ($event) {
            if (!$scope.amount || isNaN(parseFloat($scope.amount))) {
                $scope.fee = "";
            } else {
                if ($scope.amount.indexOf('.') >= 0) {
                    var strs = $scope.amount.split('.');
                    $scope.maxlength = strs[0].length + 9;
                }
                // calculate fee.


                var fee = parseInt($scope.amount * 100000000 / 100 * $scope.currentFee) / 100000000;
                //($scope.amount / 100 * $scope.currentFee).roundTo(8);

                if ($scope.amount == 0) {
                    fee = 0;
                } else if (parseFloat(fee) == 0) {
                    fee = "0.00000001";
                    $scope.fee = fee;
                } else {
                    $scope.fee = fee.toFixed(8);
                }
            }

            /*
             if (!$scope.amount) {
             $scope.fee = "";
             return;
             }

             if($scope.moreThanEightDigits(parseFloat($scope.amount))){
             console.log('fee');
             $scope.amount = parseFloat($scope.amount).roundTo(8).toString();
             console.log($scope.amount);
             }
             if($scope.currentFee){
             var fee = $scope.amount * $scope.currentFee * 0.01;
             }


             $scope.fee = fee.roundTo(8);
             */
        }


        $scope.accountChanged = function (e) {
            var string = $scope.to;

            if (!string) {
                return;
            }

            if (string[string.length - 1] == "D" || string[string.length - 1] == "C") {
                var isnum = /^\d+$/.test(string.substring(0, string.length - 1));
                if (isnum && string.length - 1 >= 1 && string.length - 1 <= 20) {
                    $scope.accountValid = true;
                }
                else {
                    $scope.accountValid = false;
                }
            }
            else {
                $scope.accountValid = false;
            }
        }

        $scope.moreThanEightDigits = function (number) {
            if (number.toString().indexOf(".") < 0) {
                return false;
            }
            else {
                if (number.toString().split('.')[1].length > 8) {
                    return true;
                }
                else {
                    return false;
                }
            }
        }

        $scope.getCurrentFee = function () {
            $http.get(peerFactory.url + "/api/blocks/getFee")
                .then(function (resp) {
                    $scope.currentFee = resp.data.fee;
                });
        }

        $scope.convertXCR = function (currency) {
            currency = String(currency);

            var parts = currency.split(".");

            var amount = parts[0];

            //no fractional part
            if (parts.length == 1) {
                var fraction = "00000000";
            } else if (parts.length == 2) {
                if (parts[1].length <= 8) {
                    var fraction = parts[1];
                } else {
                    var fraction = parts[1].substring(0, 8);
                }
            } else {
                throw "Invalid input";
            }

            for (var i = fraction.length; i < 8; i++) {
                fraction += "0";
            }

            var result = amount + "" + fraction;

            //in case there's a comma or something else in there.. at this point there should only be numbers
            if (!/^\d+$/.test(result)) {
                throw "Invalid input.";
            }

            //remove leading zeroes
            result = result.replace(/^0+/, "");

            if (result === "") {
                result = "0";
            }

            return parseInt(result);
        }

        $scope.sendCrypti = function () {

            if (($scope.amount + '').indexOf('.') != -1) {
                $scope.lengthError = $scope.amount.split('.')[1].length > 8;
                $scope.errorMessage = "More than 8 numbers in decimal part";
            }

            if ($scope.lengthError) {
                return;
            }

            $scope.amountError = $scope.convertXCR($scope.fee) + $scope.convertXCR($scope.amount) > userService._unconfirmedBalance;
            $scope.errorMessage = $scope.amountError ? "Not enough XCR" : "";

            var sendTransaction;
            var crypti = require('crypti-js');

			if ($scope.secondPassphrase) {
                sendTransaction = crypti.transaction.createTransaction($scope.to, $scope.convertXCR($scope.amount), $scope.secretPhrase, $scope.secondPhrase);
            }
            else {
                sendTransaction = crypti.transaction.createTransaction($scope.to, $scope.convertXCR($scope.amount), $scope.secretPhrase);
            }

            if (!$scope.lengthError && !$scope.sending) {
                $scope.sending = !$scope.sending;

                var keys = crypti.crypto.getKeys($scope.secretPhrase);
                var address = crypti.crypto.getAddress(keys.publicKey);

                if ($scope.secretPhrase.length == 0) {
                    $scope.amountError = true;
                    $scope.errorMessage = "Provide secret key";
                }

                if (keys.publicKey) {
                    if (keys.publicKey != sendTransaction.senderPublicKey) {
                        $scope.amountError = true;
                        $scope.errorMessage = "Please, provide valid secret key of your account";
                    }
                }

                if (!userService.balance) {
                    $scope.amountError = true;
                    $scope.errorMessage = "Account doesn't has balance";
                }

                if (!userService.publicKey) {
                    $scope.amountError = true;
                    $scope.errorMessage = "Open account to make transaction";
                }

                $http.post(peerFactory.url + "/peer/transactions", {transaction: sendTransaction}).then(function (resp) {
                    $scope.sending = !$scope.sending;
                    if (resp.data.error) {
                        $scope.errorMessage = resp.data.error;
                    }
                    else {
                        if ($scope.destroy) {
                            $scope.destroy();
                        }
                        sendCryptiModal.deactivate();
                    }
                });

            }
        }
        $scope.getCurrentFee();
    }]);