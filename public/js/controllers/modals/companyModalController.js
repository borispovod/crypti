require('angular');

angular.module('webApp').controller('companyModalController', ["$scope", "companyModal", "$http", "userService", function ($scope, addressModal, $http, userService) {
    $scope.secondPassphrase = userService.secondPassphrase;
    $scope.buttontype = "submit";

    $scope.close = function () {
        if ($scope.destroy) {
            $scope.destroy();
        }

        addressModal.deactivate();
    }

    $scope.createCompany = function () {
        $scope.stopCancel = true;

        delete $scope.domainError;
        delete $scope.emailError;
        delete $scope.fromServer;

        var domainRe = new RegExp(/^((?:(?:(?:\w[\.\-\+]?)*)\w)+)((?:(?:(?:\w[\.\-\+]?){0,62})\w)+)\.(\w{2,6})$/);

        if (!$scope.domain.match(domainRe)) {
            $scope.domainError = "Provide correct domain name";
        }

        var emailRe = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

        if (!emailRe.test($scope.email)) {
            $scope.emailError = "Provide correct email";
        }

        var domain = $scope.domain;
        var domainPart = $scope.email.split("@")[1];

        var a = domain.split('.').reverse(), b = domainPart.split('.').reverse();
        var founds = 0;

        for (var i = 0; i < a.length; i++) {
            if (!b[i]) {
                break;
            }

            if (b[i] == a[i]) {
                founds++;
            } else {
                break;
            }
        }

        if (founds < 2) {
            $scope.emailError = "Email must have same domain";
        }

        if (!$scope.emailError && !$scope.domainError) {
            $http.post("/api/createCompany", {
                secret : $scope.secretPhrase,
                accountAddress : userService.address,
                companyName : $scope.companyName,
                description : $scope.description,
                domain : $scope.domain,
                email : $scope.email,
                timestamp : $scope.timestamp,
                secondPhrase : $scope.secondPhrase
            }).then(function (resp) {
                $scope.stopCancel = false;

                if (!resp.data.success) {
                    $scope.fromServer = resp.data.error;
                } else {
                    if ($scope.destroy) {
                        $scope.destroy();
                    }

                    addressModal.deactivate(resp.data.address);
                }
            });
        }
    }

    $scope.getToken = function () {
        delete $scope.domainError;
        delete $scope.emailError;
        delete $scope.fromServer;

        var domainRe = new RegExp(/^((?:(?:(?:\w[\.\-\+]?)*)\w)+)((?:(?:(?:\w[\.\-\+]?){0,62})\w)+)\.(\w{2,6})$/);

        if (!$scope.domain.match(domainRe)) {
            $scope.domainError = "Provide correct domain name";
        }

        var emailRe = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

        if (!emailRe.test($scope.email)) {
            $scope.emailError = "Provide correct email";
        }

        var domain = $scope.domain;
        var domainPart = $scope.email.split("@")[1];

        var a = domain.split('.').reverse(), b = domainPart.split('.').reverse();
        var founds = 0;

        for (var i = 0; i < a.length; i++) {
            if (!b[i]) {
                break;
            }

            if (b[i] == a[i]) {
                founds++;
            } else {
                break;
            }
        }

        if (founds < 2) {
            $scope.emailError = "Email must have same domain";
        }

        if (!$scope.emailError && !$scope.domainError) {
            $http.post("/api/getToken", {
                secret : $scope.secretPhrase,
                accountAddress : userService.address,
                companyName : $scope.companyName,
                description : $scope.description,
                domain : $scope.domain,
                email : $scope.email,
                secondPhrase : $scope.secondPhrase
            }).then(function (resp) {
                if (!resp.data.success) {
                    $scope.fromServer = resp.data.error;
                } else {
                    $scope.token = resp.data.token;
                    $scope.timestamp = resp.data.timestamp;
                    $scope.buttontype = "button";
                }
            });
        }
    }
}]);