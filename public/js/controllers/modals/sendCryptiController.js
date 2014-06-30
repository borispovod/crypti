webApp.controller('sendCryptiController', ["$scope", "sendCryptiModal", "$http", function ($scope, sendCryptiModal, $http) {
    $scope.close = function () {
        if ($scope.destroy) {
            $scope.destroy();
        }

        sendCryptiModal.deactivate();
    }

    $scope.recalculateFee = function () {
        var fee = $scope.amount / 100 * 1;
        $scope.fee = fee;
    }

    $scope.sendCrypti = function () {
        $http.get("/api/sendMoney", { params : {
            secretPharse : $scope.secretPhrase,
            amount : $scope.amount,
            recepient : $scope.to,
            deadline : $scope.deadline,
            fee : $scope.fee
        }}).then(function (resp) {
            if ($scope.destroy) {
                $scope.destroy();
            }

            sendCryptiModal.deactivate();
        });
    }
}]);