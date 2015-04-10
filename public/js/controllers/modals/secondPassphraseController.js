require('angular');
var crypti = require('crypti-js');

angular.module('webApp').controller('secondPassphraseModalController', ["$scope", "secondPassphraseModal", "$http", "userService", "peerFactory", "transactionService",
    function ($scope, secondPassphraseModal, $http, userService, peerFactory, transactionService) {
        $scope.type = "password";
        $scope.sending = false;
        $scope.totalBalance = userService.balance;

        $scope.close = function () {
            console.log("close");
            if ($scope.destroy) {
                $scope.destroy();
            }

            secondPassphraseModal.deactivate();
        }

        $scope.changeType = function () {
            if ($scope.showPassphrase) {
                $scope.type = "text";
            } else {
                $scope.type = "password"
            }
        }

        $scope.addNewPassphrase = function () {
            if ($scope.totalBalance < 100) {
                $scope.fromServer = 'You are missing ' + (100 - $scope.totalBalance) + ' XCR';
                return;
            }

            var transaction = crypti.signature.createSignature($scope.secretPhrase, $scope.newSecretPhrase);
            var checkBeforSending = transactionService.checkTransaction(transaction, $scope.secretPhrase);

            if (checkBeforSending.err) {
                $scope.fromServer = checkBeforSending.message;
                return;
            }

            $scope.sending = true;

            $http.post(peerFactory.getUrl() + "/peer/transactions", {transaction: transaction}, transactionService.createHeaders()).then(function (resp) {
                $scope.sending = false;
                if (!resp.data.success) {
                    $scope.fromServer = resp.data.message;
                }
                else {
                    if ($scope.destroy) {
                        $scope.destroy(true);
                    }

                    secondPassphraseModal.deactivate();
                }
            });
        }
    }]);