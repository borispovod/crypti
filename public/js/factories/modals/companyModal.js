require('angular');

angular.module('webApp').factory('companyModal', function (btfModal) {
    return btfModal({
        controller: 'companyModalController',
        templateUrl: '/partials/modals/companyModal.html'
    });
});