const cheerio = require('cheerio');
const request = require('request-promise');
const jsonParser = require('json-parser');
const express = require('express');
const app = express();
const port = 3003;
const path = require('path');
const bodyParser = require('body-parser');
const favicon = require('serve-favicon'); // Import icon
const uniq = require('lodash.uniq');
const Promise = require('bluebird');
const now = require("performance-now");

const urlProduct = 'https://www.aliexpress.com/item/Evfun-4-port-wooden-fast-charging-station-5V-6A-Bamboo-desktop-charger-docking-for-iphone-android/32893207462.html';

// Get adminSeq code of product...
const getAdminSeq = uri => {
  if (!uri) {
    return null;
  }
  const options = {
    uri,
    headers: {
      'User-Agent': 'Request-Promise'
    },
    timeout: 3000,
    transform: body => {
      var dom = cheerio.load(body);
      var sendMailBtn = dom('.send-mail-btn');
      // Get adminSeq
      const adminSeq = sendMailBtn.attr('data-id1');
      return adminSeq;
    }
  };
  return request(options);
};

// Get feedback points of seller
const getFeedbackPointsOfSeller = adminSeq => {
  if (!adminSeq) {
    return null;
  }
  const uri = 'https://feedback.aliexpress.com/display/evaluationDsrAjaxService.htm?&ownerAdminSeq='+adminSeq;
  const options = {
    uri,
    headers: {
      'User-Agent': 'Request-Promise'
    },
    timeout: 3000,
    transform: body => {
      var pointsData = jsonParser.parse(body);
      return pointsData;
    }
  };
  return request(options);
};

// Check product has epacket shipping
const hasEpacket = (product) => {
  if (!product.productId) {
    return;
  }
  const uri = 'https://freight.aliexpress.com/ajaxFreightCalculateService.htm?f=d&productid='+product.productId+'&count=1&minPrice=1.59&maxPrice=1.59&currencyCode=USD&transactionCurrencyCode=USD&sendGoodsCountry=&country=VN&province=&city=';
  const options = {
    uri,
    headers: {
      'User-Agent': 'Request-Promise'
    },
    timeout: 3000,
    transform: body => {
      var position = body.indexOf("ePacket");
      if (position > -1) {
        return product.productUrl;
      }
      return null;
    }
  };
  return request(options);
}

// Setting app
app.use(express.static(__dirname + '/public')); // Set public folder
app.set('view engine', 'pug'); // Set engine template
app.use(favicon(__dirname + '/public/favicon.ico')); // Set icon website
app.use(bodyParser.json()); // Support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // Support encoded bodies



/*
 * Routing
 */
app.get('/', (req, res) => {
  res.render('searchPage');
});

app.get('/searchKeyWord', (req, res) => {
  res.render('searchPage');
});

app.post('/searchKeyWord', (req, res) => {
  var startTask = now();
  var uri = 'http://gw.api.alibaba.com/openapi/param2/2/portals.open/api.listPromotionProduct/72103?fields=products,productId,imageUrl,evaluateScore,productUrl&keywords=';
  var keyWord = req.body.keyWord;
  uri = uri + encodeURI(keyWord);
  const options = {
    uri,
    headers: {
      'User-Agent': 'Request-Promise'
    },
    timeout: 3000,
    transform: body => {
      var data = jsonParser.parse(body);
      if (!data.result) {
        // Redirect route if error
        res.redirect('/');
      }
      else {
        // Show result
        var products = data.result.products; // All products
        var result = []; // List product after filter
        Promise.mapSeries(
          uniq(products),
          function(product) {
            return hasEpacket(product)
              .then(productUrl => getAdminSeq(productUrl))
              .then(adminSeq => getFeedbackPointsOfSeller(adminSeq))
              .then(pointsData => {
                if (pointsData.shipping.score >= 4.8 && product.evaluateScore >= 5){
                  result.push({...product, shippingScore: pointsData.shipping.score});
                }
                else
                  return;
              })
              .catch(err => {});
          },
          { concurrency: 1 }
        ).then(() => {
          var endTask = now();
          console.log('\n')
          console.log('Took ' + parseFloat((endTask - startTask) / 1000).toFixed(2) + ' seconds.');
          console.log('Found ' + result.length + ' product(s)');
          console.log(result);
          console.log('\n')
          console.log('==========================================================================');
          res.render('searchResult', {products: result});
        });
      }
    }
  };
  return request(options);
});

app.listen(port, () => console.log(`App listening on port ${port}!`));