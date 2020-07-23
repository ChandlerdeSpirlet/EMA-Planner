require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_API_KEY);
const UTILS = require('../utils/format-numbers.js');

function getAllProductsAndPlans() {
    return Promise.all(
        [
            stripe.products.list({}),
            stripe.plans.list({})
        ]
    ).then(stripeData => {
        var products = stripeData[0].data;
        var plans = stripeData[1].data;

        plans = plans.sort((a, b) => {
            return a.amount - b.amount;
        }).map(plan => {
            amount = UTILS.formatUSD(plan.amount)
            return {...plan, amount};
        });

        products.forEach(product => {
            const filteredPlans = plans.filter(plan => {
                return plan.product === product.id;
            });

            product.plans = filteredPlans;
        });

        return products;
    });
}

module.exports = {
    getAllProductsAndPlans,
};