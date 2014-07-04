webApp.controller('sendCryptiController', ["$scope", "sendCryptiModal", "$http", "userService", function ($scope, sendCryptiModal, $http, userService) {
    $scope.accountValid = true;
    $scope.fromServer = "";

    Number.prototype.roundTo = function( digitsCount ){
        var digitsCount = typeof digitsCount !== 'undefined' ? digitsCount : 2;
        var s = String(this);
        var e = s.indexOf('.');
        if( e == -1 ) return this;
        var c = s.length - e - 1;
        if( c < digitsCount ) digitsCount = c;
        var e1 = e + 1 + digitsCount;
        var d = Number(s.substr(0,e) + s.substr(e+1, digitsCount));
        if( s[e1] > 4 ) d += 1;
        d /= Math.pow(10, digitsCount);
        return d.valueOf();
    }

    Math.roundTo = function( number ,digitsCount){
        number = Number(number);
        return number.roundTo(digitsCount).valueOf();
    }

    $scope.close = function () {
        if ($scope.destroy) {
            $scope.destroy();
        }

        sendCryptiModal.deactivate();
    }

    $scope.moreThanEightDigits = function(number) {
        if (number.toString().indexOf(".") < 0) {
            return false;
        }
        else{
            if(number.toString().split('.')[1].length>8){
                return true;
            }
            else{
                return false;
            }
        }
    }

    $scope.recalculateFee = function () {
        if($scope.moreThanEightDigits($scope.amount)){
            $scope.amount = $scope.amount.roundTo(8);
        }
        if($scope.currentFee){
            var fee = $scope.amount * $scope.currentFee * 0.01;
        }
        $scope.fee = fee.roundTo(8);
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

    $scope.moreThanEightDigits = function (number) {
        if (number.toString().indexOf(".") < 0) {
            return false;
        }
        else{
            if(number.toString().split('.')[1].length>8){
                return true;
            }
            else{
                return false;
            }
        }
    }

    $scope.getCurrentFee = function () {
        $http.get("/api/getCurrentFee", { params : { accountId : userService.address }})
            .then(function (resp) {
                $scope.currentFee = resp.data.currentFee;
            });
    }

    $scope.sendCrypti = function () {
        $http.get("/api/sendMoney", { params : {
            secretPharse : $scope.secretPhrase,
            amount : $scope.amount,
            recepient : $scope.to,
            accountAddress : userService.address,
            deadline : $scope.deadline,
            fee : $scope.fee
        }}).then(function (resp) {
            if(resp.data.error){
                console.log(resp.data.error);
                $scope.fromServer = resp.data.error;
            }
            if ($scope.destroy) {
                $scope.destroy();
            }

            sendCryptiModal.deactivate();
        });
    }
    $scope.getCurrentFee();
}]);