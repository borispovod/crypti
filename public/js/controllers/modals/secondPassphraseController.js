require('angular');

angular.module('webApp').controller('secondPassphraseModalController', ["$scope", "secondPassphraseModal", "$http", "userService", function ($scope, secondPassphraseModal, $http, userService) {
    $scope.type = "password";

    $scope.close = function () {
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
        $http.put("/api/signatures", {
            secret: $scope.secretPhrase,
			secondSecret: $scope.newSecretPhrase,
            publicKey: userService.publicKey
        }).then(function (resp) {
            if (resp.data.error) {
                $scope.fromServer = resp.data.error;
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