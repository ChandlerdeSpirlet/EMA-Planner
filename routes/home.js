var express = require('express');
var app = express();
var path = require('path');
var session = require("express-session");
var exp_val = require('express-validator');
const fastcsv = require("fast-csv");
var fs = require('fs');
var nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const nunjucks = require('nunjucks');

const STRIPE_API = require('../api/stripe-functions.js');
app.use('../../styles/', express.static('styles'));

app.set('view engine', 'html');
app.engine('html', nunjucks.render);
nunjucks.configure('views', {noCache: true});

var db = require('../database');
const cors = require('cors');
app.use(cors());

module.exports = app;


app.use(session({
    secret: 'EMA_Planner',
    resave: false,
    saveUninitialized: true,
    cookie: {maxAge: 8 * 60 * 1000}
}));
app.use(
    bodyParser.urlencoded({
        extended: true,
    })
)
app.use(bodyParser.json())
app.use(exp_val());
app.use(express.static(path.join(__dirname, 'home')));

app.get('/', function(req, res){
    if (req.headers['x-forwarded-proto'] != 'https'){
        res.redirect('https://ema-planner.herokuapp.com/')
    } else {
        res.render('home/home', {
            classes_today: '',
            classes_weekly: ''
        })
    }
});


app.get('/add_student', function(req, res){
    if (req.headers['x-forwarded-proto'] != 'https'){
        res.redirect('https://ema-planner.herokuapp.com/home/add_student')
    } else {
        res.render('home/add_student', {
            barcode: '',
            first_name: '',
            last_name: '',
            addr_1: '',
            city: '',
            zip: '',
            email: '',
            phone: '',
            belt_color: '',
            belt_size: ''
        })
    }
});

app.post('/add_student', function(req, res){
    var item = {
        first_name: req.sanitize('first_name').trim(),
        last_name: req.sanitize('last_name').trim(),
        barcode: req.sanitize('barcode').trim(),
        addr_1: req.sanitize('addr_1').trim(),
        city: req.sanitize('city').trim(),
        zip: req.sanitize('zip').trim(),
        email: req.sanitize('email').trim(),
        phone: req.sanitize('phone').trim(),
        belt_color: req.sanitize('belt_color').trim(),
        belt_size: req.sanitize('belt_size').trim()
    }
    var query = 'insert into student list (barcode, first_name, last_name, addr_1, zip_code, city, belt_color, belt_size, email, phone_number) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);';
    db.query(query, [item.barcode, item.first_name, item.last_name, item.addr_1, item.zip, item.city, item.belt_color, item.belt_size, item.email, item.phone])
        .then(function(rows){
            req.flash('success', 'Successfully added student.');
            res.redirect('/');
        })
        .catch(function(err){
            req.flash('error', 'Student not enrolled.' + 'ERROR: ' + err);
            res.redirect('/');
        })
});

app.get('/adminView', function(req, res){
    STRIPE_API.getAllProductsAndPlans().then(products => {
        res.render('home/adminView.html', {products: products});
    });
});

app.get('/createProduct', (req, res) => {
    res.render('home/createProduct.html');
});

app.post('/createProduct', (req, res) => {
    STRIPE_API.createProduct(req.body).then(() => {
        res.render('home/createProduct.html', {success: true});
    });
});

app.post('/createPlan', (req, res) => {
    res.render('home/createPlan.html', {
        productID: req.body.productID,
        productName: req.body.productName
    });
});

app.post('/createPlanForReal', (req, res) => {
    STRIPE_API.createPlan(req.body).then(() => {
        res.render('home/createPlan.html', {success: true});
    });
});

app.get('/customerView', (req, res) => {
    STRIPE_API.getAllProductsAndPlans().then(products => {
        products = products.filter(product => {
            return product.plans.length > 0;
        });

        res.render('home/customerView.html', {products: products});
    });
});

app.post('/signUp', (req, res) => {
    var product = {
        name: req.body.productName
    };

    var plan = {
        id: req.body.planId,
        name: req.body.planName,
        amount: req.body.planAmount,
        interval: req.body.planInterval,
        interval_count: req.body.planIntervalCount
    }

    res.render('home/signUp.html', {product: product, plan: plan});
});

app.post('/processPayment', (req, res) => {
    var product = {
        name: req.body.productName
    };
    
    var plan = {
        id: req.body.planId,
        name: req.body.planName,
        amount: req.body.planAmount,
        interval: req.body.planInterval,
        interval_count: req.body.planIntervalCount
    }

    STRIPE_API.createCustomerAndSubscription(req.body).then(() => {
        res.render('home/signUp.html', {product: product, plan: plan, success: true});
    }).catch(err => {
        res.render('home/signUp.html', {product: product, plan: plan, error: true});
    });
});