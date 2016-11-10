'use strict';

const FormRoute = require('./form');
const Dicer = require('dicer');

/**
 * @Route("POST /")
 * @Post(alias="postData")
 */
class FormPostRoute extends FormRoute {
  constructor(request) {
    super();
    request.setParameter('boundary', request.multipartBoundary);
    this.setParameter = (name, value) => {
      request.setParameter(name, value);
    };
  }

  /**
   * Parse headers of a multipart message part.
   */
  parseHeaders(headers) {
    let name = null;
    let filename = null;
    let contentType = null;
    if (headers['content-disposition'] instanceof Array) {
      name = String(headers['content-disposition'][0]).match(/name="([^"]+)"/);
      name = name === null ? null : name[1];
      filename = String(headers['content-disposition']).match(/filename="([^"]+)"/);
      filename = filename === null ? null : filename[1];
    }
    if (headers['content-type'] instanceof Array) {
      contentType = headers['content-type'][0];
    }
    return {name, filename, contentType};
  }

  /**
   * Process incoming data.
   */
  preprocess(postData, boundary) {
    let resolve;
    let defer = new Promise(_resolve => {
      resolve = _resolve;
    });
    const files = [];
    const fields = {};
    const dicer = new Dicer({boundary});
    dicer.on('part', part => {
      let headers;
      let chunks = [];
      let info;
      part.on('header', data => {
        info = this.parseHeaders(data);
      });
      part.on('data', chunk => {
        chunks.push(chunk);
      });
      part.on('end', () => {
        const contents = Buffer.concat(chunks);
        if (info.contentType) {
          const file = {
            contentType: info.contentType,
            filename: info.filename,
            contents
          };
          if (typeof files[info.name] === 'object') {
            files[info.name] = [files[info.name]];
            files[info.name].push(file);
          }
          else {
            files[info.name] = file;
          }
        }
        else {
          if (typeof fields[info.name] === 'object') {
            fields[info.name] = [fields[info.name]];
            fields[info.name].push(contents.toString());
          }
          else {
            fields[info.name] = contents.toString();
          }
        }
      });
    });
    dicer.on('finish', resolve);
    postData.pipe(dicer);
    this.setParameter('postData', fields);
    this.setParameter('files', files);
    return defer;
  }

  process(postData, files) {
    var uri = 'data:' + files.file.contentType + ';base64,' + files.file.contents.toString('base64');
    return `Hello ${postData.name},<br/><img src="${uri}" />`;
  }
}

module.exports = FormPostRoute;
