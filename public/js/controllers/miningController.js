webApp.controller('miningController', ['$scope', '$rootScope', '$http', "userService", function($rootScope, $scope, $http, userService) {
    $scope.address = userService.address;
    $scope.effectiveBalance = userService.effectiveBalance;
    console.log(userService);
    $scope.forging = userService.forging;

    $http.get('/js/genblocks.json')
        .then(function(res){
            console.log(res.data);
            for(var i= 0;i<res.data.length;i++){
                res.data[i].dateTime = new Date( Date.parse(res.data[i].dateTime));
            }
            $scope.genblocks = res.data;
        });
    $http.get('/js/addresses.json')
        .then(function(res){
            console.log(res.data);
            $scope.addresses = res.data;
        });
}]);