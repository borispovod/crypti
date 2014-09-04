webApp.controller('passphraseController', ['$scope', '$rootScope', '$http', "$state", "userService",
    function($rootScope, $scope, $http, $state, userService) {
        angular.element(document.getElementById("forgingButton")).show();

        $scope.login = function(pass) {
            var data = {secret: pass};
            if (!pass || pass.length > 100){
            }
            else{
                $http.post("/api/unlock", { secret : pass })
                    .then(function (resp) {
                        if (resp.data.success) {
                            userService.setData(resp.data.address, resp.data.publickey, resp.data.balance, resp.data.unconfirmedBalance, resp.data.effectiveBalance);
                            userService.setForging(resp.data.forging);
                            userService.setSecondPassphrase(resp.data.secondPassphrase);
                            userService.unconfirmedPassphrase = resp.data.unconfirmedPassphrase;

                            angular.element(document.getElementById("forgingButton")).hide();
                            $state.go('main.account');
                        } else {
                            alert("Something wrong. Restart server please.");
                        }
                    });
            }
        }
}]);