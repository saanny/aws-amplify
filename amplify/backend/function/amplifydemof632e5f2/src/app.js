/* Amplify Params - DO NOT EDIT
	ENV
	REGION
Amplify Params - DO NOT EDIT *//*
Copyright 2017 - 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at
    http://aws.amazon.com/apache2.0/
or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and limitations under the License.
*/




const express = require('express')
const bodyParser = require('body-parser')
const awsServerlessExpressMiddleware = require('aws-serverless-express/middleware')
const AWS = require('aws-sdk');
const { default: ShortUniqueId } = require("short-unique-id");
const AmazonCognitoId = require("amazon-cognito-identity-js")
const {CognitoJwtVerifier} = require("aws-jwt-verify")
AWS.config.update({region:"eu-north-1" });

const cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider();

const docClient = new AWS.DynamoDB.DocumentClient({
  region:"eu-north-1"
});
const PRODUCT_TABLE = "products";


// declare a new express app
const app = express()
app.use(bodyParser.json())
app.use(awsServerlessExpressMiddleware.eventContext())




// Enable CORS for all methods
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Headers", "*")
  next()
});






const poolData = {
  UserPoolId:"eu-north-1_tP4dHzTgA",
  ClientId:"20dir3sc1rcs3k6psirgp5fr6h"
}


const userPool = new AmazonCognitoId.CognitoUserPool(poolData)

const login = ({email,password})=>{
  return new Promise((resolve,reject)=>{
    const authenticationUser = new AmazonCognitoId.AuthenticationDetails({
      Username:email,
      Password:password
    })
    const userData = {
      Username:email,
      Pool:userPool
    }
    const cognitoUser = new AmazonCognitoId.CognitoUser(userData)
  
    cognitoUser.authenticateUser(authenticationUser,{
      onSuccess:(result)=> {
         resolve({
          accessToken :result.getAccessToken().getJwtToken(),
          idToken : result.getIdToken().getJwtToken(),
          refreshToken: result.getRefreshToken().getToken()
         })
      },
      onFailure:(err)=>{
        reject(err)
      }
    })
    
  })
}

const authenticated = async (req,res,next) => {
  try {
    let token;

    let authorization = req?.headers?.authorization ?? null;

    if (!authorization) res.status(401).end()

    const tokenArray = authorization?.split(" ");
    if (tokenArray[0] != "Bearer" || !tokenArray[1]){res.status(401).end()}
     
    token = tokenArray[1];

    const verifier = CognitoJwtVerifier.create({
      userPoolId: poolData.UserPoolId,
      tokenUse: "access",
      clientId: poolData.ClientId,
    });
    
   
    const payload = await verifier.verify(token)

    const params = {
      UserPoolId: poolData.UserPoolId,
      Username: payload.sub,
    };
    const userData = await cognitoIdentityServiceProvider.adminGetUser(params).promise();
  
    req.user = {
      sub:payload.sub,
      email:userData.UserAttributes.find(attr => attr.Name === 'email').Value
    };

    next();
  } catch (error) {
    next(error);
  }
}

// User
app.post('/confirm', async function(req, res) {
  const {confirmationCode,email} = req.body

  try {
    var userPool = new AmazonCognitoId.CognitoUserPool(poolData);
    var userData = {
      Username: email,
      Pool: userPool,
    };
    var cognitoUser = new AmazonCognitoId.CognitoUser(userData);
    cognitoUser.confirmRegistration(confirmationCode, true, function(err, result) {
      if (err) {
     JSON.stringify(err);
        return;
      }
      console.log('call result: ' + result);
    });
    res.json({success: 'confirmed', url: req.url});
  } catch (error) {
    console.log(error)
    res.status(500).end()
  }

})


app.post('/register', async function(req, res) {
  const {name,email,password} = req.body
  try {
    const attributesList = []

    attributesList.push(new  AmazonCognitoId.CognitoUserAttribute({
      Name:"name",Value:name
    }))
    attributesList.push(new  AmazonCognitoId.CognitoUserAttribute({
      Name:"email",Value:email
    }))

    userPool.signUp(email,password,attributesList,null,(err,data)=>{
      console.log(err)
      console.log(data)
    })
    res.json({success: 'signed up', url: req.url});
  } catch (error) {
    console.log(error)
  res.status(500).end()
  }

})

app.post('/login', async function(req, res) {
  const {email,password} = req.body
  try {
    const result = await login({email,password})

   return res.json({data:result, url: req.url});
  } catch (error) {
    console.log(error)
  res.status(500).end()
  }

})

app.get('/products',authenticated, async function(req, res) {
  const params = {
    TableName: PRODUCT_TABLE,
    IndexName: "UserIdIndex",
    KeyConditionExpression: "userId = :userId",
    ExpressionAttributeValues: {
      ":userId": req.user.sub
    }
  };

  const { Count, Items } = await docClient.query(params).promise();
  const itemsChanged = Items.map((item) => {
    return {
      ...item,
      created_at: new Date(item.created_at).toLocaleDateString("en-GB"),
      updated_at: new Date(item.updated_at).toLocaleDateString("en-GB")
    };
  });
  res.json({success: {
    Count,
    Item:itemsChanged
  }, url: req.url});
});


app.post('/products',authenticated, async function(req, res) {

  const { name, detail } = req.body;
  try {
    const uId = new ShortUniqueId({ length: 10 });
    const productId = uId();
    const now = new Date();
    const params = {
      TableName: PRODUCT_TABLE,
      Item: {
        id: productId,
        name,
        detail,
        userId: req.user.sub,
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      }
    };

    await docClient.put(params).promise();

    // const userData = await findUserById(user.id);
    res.json({data: 
      {
        id: productId,
        name,
        detail,
        user:req.user,
        created_at: now.toLocaleDateString("en-GB"),
        updated_at: now.toLocaleDateString("en-GB")
      }})
  } catch (error) {
    console.log(error)
  res.status(500).end()
  }
 
});


app.patch('/products/:id',authenticated, async function(req, res) {
try {
  const {name,detail} = req.body
  const {id} = req.params;
  const now = new Date().toISOString();
  const params = {
    TableName: PRODUCT_TABLE,
    Key: {
      id: id
    },
    UpdateExpression:
      "SET #name = :name, #detail = :detail,  #updated_at = :updated_at",
    ExpressionAttributeNames: {
      "#name": "name",
      "#detail": "detail",
      "#updated_at": "updated_at"
    },
    ExpressionAttributeValues: {
      ":name": name,
      ":detail": detail,
      ":updated_at": now
    }
  };
    await docClient.update(params).promise()
    
  res.json({success: 'successFullyUpdated'})
} catch (error) {
  console.log(error)
  res.status(500).end()
}
});




app.delete('/products/:id', async function(req, res) {
  try {
    const {id} = req.params;

    const params = {
      TableName: PRODUCT_TABLE,
      Key: {
        id: id
      }
    };
  
    
      await docClient.delete(params).promise();
  
    res.json({success: 'deleted successfully'});
  } catch (error) {
    console.log(error)
    res.status(500).end()
  }
});


app.listen(3000, function() {
    console.log("App started")
});

// Export the app object. When executing the application local this does nothing. However,
// to port it to AWS Lambda we will create a wrapper around that will load the app from
// this file
module.exports = app
