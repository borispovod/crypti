webApp.controller('sendCryptiController', ["$scope", "sendCryptiModal", "$http", function ($scope, sendCryptiModal, $http) {
    $scope.accountValid = true;
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

    $scope.accountChanged = function (e) {
        var string = $scope.to;
        if(string[string.length - 1] == "D" || string[string.length - 1] == "C"){
            var isnum = /^\d+$/.test(string.substring(0,string.length-1));
            if(isnum && string.length-1>=1 && string.length-1<=20){
                $scope.accountValid = true;
            }
            else{
                $scope.accountValid = false;
            }
        }
        else{
            $scope.accountValid = false;
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