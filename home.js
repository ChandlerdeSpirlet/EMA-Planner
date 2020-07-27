const express = require('express');
const bodyParser = require('body-parser');
const nunjucks = require('nunjucks');
const session = require('express-session');
const exp_val = require('express-validator');


const app = express();
const port = process.env.PORT;
//const port = 5000;
const router = express.Router();
app.use(exp_val());

const STRIPE_API = require('./api/stripe-functions.js');

app.set('view engine', 'html');
app.engine('html', nunjucks.render);
nunjucks.configure('views', {noCache: true});

app.use(express.static(__dirname));
app.use(bodyParser());
app.use('/', router);

const db = require('./database');

app.use(session({
    secret: 'ema-Planner',
    resave: false,
    saveUninitialized: true,
    cookie: {maxAge: 60 * 60 * 1000}
}));

router.get('/', (req, res) => {
    //if (req.headers['x-forwarded-proto'] != 'https'){
    //    res.redirect('https://ema-planner.herokuapp.com/')
    //} else {
        res.render('home.html', {
            classes_today: '',
            classes_weekly: ''
        });
    //}
});

router.get('/add_student', function(req, res){
    //if (req.headers['x-forwarded-proto'] != 'https'){
    //    res.redirect('https://ema-planner.herokuapp.com/home/add_student')
    //} else {
        res.render('add_student', {
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
    //}
});

router.post('/add_student', function(req, res){
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
    console.log('INFO TESTING: ' + item.zip + ' ' + item.addr_1);
    var query = 'insert into student_list (barcode, first_name, last_name, addr_1, zip_code, city, belt_color, belt_size, email, phone_number) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);';
    db.query(query, [item.barcode, item.first_name, item.last_name, item.addr_1, item.zip, item.city, item.belt_color, item.belt_size, item.email, item.phone])
        .then(function(rows){
            console.log("In .then");
            var redir_link = '/customerView/' + item.first_name + ' ' + item.last_name + '/' + item.email + '/' + item.phone;
            res.redirect(redir_link);
        })
        .catch(function(err){
            res.redirect('/');
            console.log('ERROR is ' + err);
        })
});

router.get('/adminView', function(req, res){
    STRIPE_API.getAllProductsAndPlans().then(products => {
        res.render('adminView.html', {products: products});
    });
});

router.get('/createProduct', (req, res) => {
    res.render('createProduct.html');
});

router.post('/createProduct', (req, res) => {
    STRIPE_API.createProduct(req.body).then(() => {
        res.render('createProduct.html', {success: true});
    });
});

router.post('/createPlan', (req, res) => {
    res.render('createPlan.html', {
        productID: req.body.productID,
        productName: req.body.productName
    });
});

router.post('/createPlanForReal', (req, res) => {
    STRIPE_API.createPlan(req.body).then(() => {
        res.render('createPlan.html', {success: true});
    });
});

router.get('/customerView/(:studentName)/(:studentEmail)/(:studentPhone)', (req, res) => {
    STRIPE_API.getAllProductsAndPlans().then(products => {
        products = products.filter(product => {
            return product.plans.length > 0;
        });

        res.render('customerView.html', {
            products: products,
            studentName: req.params.studentName,
            studentEmail: req.params.studentEmail,
            studentPhone: req.params.studentPhone
        });
    });
});

router.get('/customerView', (req, res) => {
    STRIPE_API.getAllProductsAndPlans().then(products => {
        products = products.filter(product => {
            return product.plans.length > 0;
        });

        res.render('customerView.html', {
            products: products
        });
    });
});

router.post('/signUp', (req, res) => {
    var product = {
        name: req.body.productName
    };

    var plan = {
        Id: req.body.planId,
        name: req.body.planName,
        amount: req.body.planAmount,
        interval: req.body.planInterval,
        interval_count: req.body.planIntervalCount
    }


    res.render('signUp.html', {
        product: product, 
        plan: plan,
        studentEmail: req.body.studentEmail,
        studentName: req.body.studentName,
        studentPhone: req.body.studentPhone
    });
});

router.post('/processPayment', (req, res) => {
    var product = {
        name: req.body.productName
    };
    
    var plan = {
        Id: req.body.planId,
        name: req.body.planName,
        amount: req.body.planAmount,
        interval: req.body.planInterval,
        interval_count: req.body.planIntervalCount
    }

    STRIPE_API.createCustomerAndSubscription(req.body).then(() => {
        res.render('signUp.html', {
            product: product, 
            plan: plan, 
            success: true,
            studentEmail: req.body.studentEmail,
            studentName: req.body.studentName,
            studentPhone: req.body.studentPhone
        });
    }).catch(err => {
        res.render('signUp.html', {
            product: product, 
            plan: plan, 
            error: true,
            studentEmail: req.body.studentEmail,
            studentName: req.body.studentName,
            studentPhone: req.body.studentPhone
        });
    });
});

app.listen(port, () => {
    console.info('EMA-Planner running on port', port);
});