require('angular');
var crypti = require('crypti-js');

angular.module('webApp').controller('secondPassphraseModalController', ["$scope", "secondPassphraseModal", "$http", "userService", "peerFactory", "transactionService",
    function ($scope, secondPassphraseModal, $http, userService, peerFactory, transactionService) {
        $scope.type = "password";
        $scope.sending = false;

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
                $scope.type = "password";
            }
        }

        $scope.addNewPassphrase = function () {

            var transaction = crypti.signature.createSignature($scope.secretPhrase, $scope.newSecretPhrase);
            var checkBeforSending = transactionService.checkTransaction(transaction, $scope.secretPhrase);

            if (checkBeforSending.err) {
                $scope.fromServer = checkBeforSending.err.message;
                return;
            };

            $scope.sending = true;
            $http.post(peerFactory.url + "/peer/transactions", {transaction: voteTransaction}, transactionService.createHeaders()).then(function (resp) {
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