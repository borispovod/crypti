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

    $scope.accountChanged = function () {
        console.log("test");
        if($scope.to.slice(-1)!='C' || $scope.to.slice(-1)!='D'){
            if($scope.to.slice(0, -1).length>=1 && $scope.to.slice(0, -1).length<=20){
                $scope.accountValid = true;
            }
        }
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