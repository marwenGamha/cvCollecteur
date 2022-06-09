"use strict";

const AWS = require("aws-sdk");
const { nanoid } = require("nanoid/async");
const Busboy = require("busboy");


const Ajv = require("ajv")
const addFormats = require("ajv-formats")
const ajv = new Ajv({allErrors: true}) 
addFormats(ajv)

const dynamo = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const now = new Date();

const CV_TABLE = process.env.CV_TABLE;


/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Context doc: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html 
 * @param {Object} context
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 * 
 */
exports.lambdaHandler = async (event, context) => {
    console.log(event)
    switch (event.httpMethod) {

        case "POST":
            if (event.resource == "/upload/cv") {

            return saveCv(event);

        }
            else  return sendResponse(
                404,
                JSON.stringify(`Unsupported path  ${event.httpMethod} `)
              );
            

        default:
            return sendResponse(
                  404,
                  JSON.stringify(`Unsupported method  ${event.httpMethod} `)
                );
    }

}

const saveCv = async (event)=>{

    // let {file,firstName,lastName ,email ,university ,source }= JSON.parse(event.body)
    // let {body }= JSON.parse(event.body)

  // step 1
  // parse the multipart/form-data
  let form;
  try {
    // multipart/form-data is configured as a binary type in
    // API Gateway, therefore the body data is received as a
    // base64 encoded string
    const base64BodyString = event.body;

    // convert to base64 buffer
    const base64Body = Buffer.from(base64BodyString, "base64"); // base64 body from API gateway


    form = await parseForm(event.headers, base64Body);




  } catch (parseError) {

    return sendResponse(
      400,
      JSON.stringify({error:"error in parsing your data"})
    );



  }

    // write the PDF to disk
    if (form) {
        const filename = form.Filename.filename;
        const conTyoe = form.Filename.mimeType;
        const media = form.file;
        let uid =await nanoid(10)

        let uniquekey =`${uid}_${filename}`
        let params = {
            Bucket: 'cvcollecter-attachments',
            Key: `cv/summer2022/${uniquekey}`,
            Body: media ,
            ContentType:conTyoe
        
        }
        
        try {
         await s3.putObject(params).promise();

            let itemData = {
                id: uid,
                email: form.email,
                fullName: form.fullName,
                university: form.university ,
                source: form.source ,
                created_date: now.toISOString(),
                filename: uniquekey,
            };


        const params2 = {
            TableName: CV_TABLE,
            Item: itemData,
        };
    
        return dynamo
            .put(params2)
            .promise()
            .then(() => {

                return sendResponse(
                    200,
                    JSON.stringify({message:"You have successfully submitted your application"})
                );


            });




        } catch (e) {
          console.log("Error uploading data: ", e);
          return sendResponse(
            400,
            JSON.stringify({error:"something want wrong"})
          );
        }



    }
    else return sendResponse(
       400,
        JSON.stringify({error:"erroe in form"})
    );



}

const parseForm = (headers, body) => {
    return new Promise((resolve, reject) => {
      let form = {};
  
      const contentType = headers["Content-Type"] || headers["content-type"];
      const bb =  Busboy({ headers: { "content-type": contentType } });
  
      bb.on("field", (fieldname, val) => {
        form[fieldname] = val;
      });
  
      bb.on("file", (fieldname, file, filename, encoding, mimetype) => {
        console.log(
          "File [%s]: filename=%j; encoding=%j; mimetype=%j",
          fieldname,
          filename,
          encoding,
          mimetype
        );
  
        form.Fieldname = fieldname;
        form.Filename = filename;
        form.Encoding = encoding;
        form.Mimetype = mimetype;
  
        file.on("data", (data) => {
          console.log("File [%s] got %d bytes", fieldname, data.length);
          form[fieldname] = data;
        });
  
        file.on("end", () => console.log("File [%s] Finished", fieldname));
      });
  
      bb.on("finish", () => {
        resolve(form);
      });
  
      bb.on("error", (err) => {
        reject(err);
      });
  
      bb.end(body);
    });
  };



function sendResponse(statusCode, message) {
    const response = {
      statusCode: statusCode,
      headers: {
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Origin": "*",
      },
      body: message,
    };
    return response;
  }
  
