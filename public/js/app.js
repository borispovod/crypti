require('angular');
require('angular-ui-router');
require('angular-modal');
require('angular-resource');
require('browserify-angular-animate');
require('../bower_components/angular-chart.js/dist/angular-chart.js');
require('../node_modules/ng-table/ng-table.js');


webApp = angular.module('webApp', ['ui.router', 'btford.modal', 'ngTable', 'ngAnimate',  'chart.js']);

webApp.config([
    "$locationProvider",
    "$stateProvider",
    "$urlRouterProvider",
    function ($locationProvider, $stateProvider, $urlRouterProvider) {

        $locationProvider.html5Mode(true);
        $urlRouterProvider.otherwise("/");

        // Now set up the states
        $stateProvider
            .state('main', {
                abstract: true,
                templateUrl: "/partials/app-template.html",
                controller: "templateController"
            })
            .state('main.dashboard', {
                url: "/dashboard",
                templateUrl: "/partials/account.html",
                controller: "accountController"
            })
            .state('main.transactions', {
                url: "/transactions",
                templateUrl: "/partials/transactions.html",
                controller: "transactionsController"
            })
            .state('main.delegates', {
                url: "/delegates",
                templateUrl: "/partials/delegates.html",
                controller: "delegatesController"
            })
            .state('main.votes', {
                url: "/delegates/votes",
                templateUrl: "/partials/votes.html",
                controller: "votedDelegatesController"
            })
            .state('main.forging', {
                url: "/forging",
                templateUrl: "/partials/forging.html",
                controller: "forgingController"
            })
            .state('main.blockchain', {
                url: "/blockchain",
                templateUrl: "/partials/blockchain.html",
                controller: "blockchainController"
            })
            .state('passphrase', {
                url: "/",
                templateUrl: "/partials/passphrase.html",
                controller: "passphraseController"
            });
    }
]);




