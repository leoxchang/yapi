const _ = require('underscore');
const axios = require('axios');
const yapi = require('../server/yapi.js');
const interfaceModel = require('../server/models/interface.js');
const interfaceCatModel = require('../server/models/interfaceCat.js');
const logModel = require('../server/models/log.js');


const isNode = typeof global == 'object' && global.global === global;

async function handle(
  res,
  projectId,
  selectCatid,
  menuList,
  basePath,
  dataSync,
  messageError,
  messageSuccess,
  callback,
  token,
  port
) {

  const taskNotice = _.throttle((index, len) => {
    messageSuccess(`正在导入，已执行任务 ${index + 1} 个，共 ${len} 个`)
  }, 3000)

  const handleAddCat = async cats => {
    let catsObj = {};
    if (cats && Array.isArray(cats)) {
      for (let i = 0; i < cats.length; i++) {
        let cat = cats[i];
        let findCat = _.find(menuList, menu => menu.name === cat.name);
        catsObj[cat.name] = cat;
        if (findCat) {
          cat.id = findCat._id;
        } else {
          let apipath = '/api/interface/add_cat';
          if (isNode) {
            apipath = 'http://127.0.0.1:' + port + apipath;
          }

          let data = {
            name: cat.name,
            project_id: projectId,
            desc: cat.desc,
            token
          };
          console.log('新增cat [' + cat.name + ']');
          let result = await axios.post(apipath, data);

          if (result.data.errcode) {
            messageError(result.data.errmsg);
            callback({showLoading: false});
            return false;
          }
          cat.id = result.data.data._id;
        }
      }

      //当cats的length大于零时,删除多余的cat
      if (cats.length > 0) {
        for (let i = 0; i < menuList.length; i++) {
          let menu = menuList[i];
          let findCat = _.find(cats, cat => cat.name === menu.name);
          if (!findCat) {
            console.log('删除多余的cat [' + menu.name + ']');
            await yapi.getInst(interfaceCatModel).del(menu._id);
          }
        }
      }
    }
    return catsObj;
  };

  const handleAddInterface = async info => {
    const cats = await handleAddCat(info.cats);
    if (cats === false) {
      return;
    }

    const res = info.apis;
    let len = res.length;
    let count = 0;
    let successNum = len;
    let existNum = 0;
    if (len === 0) {
      messageError(`解析数据为空`);
      callback({showLoading: false});
      return;
    }
    let upTime = yapi.commons.time();
    //判断selectCatid是否为空
    if (selectCatid == null) {
      let menus = await yapi.getInst(interfaceCatModel).list(projectId);
      selectCatid = menus[0]._id;
    }

    if (info.basePath) {
      let projectApiPath = '/api/project/up';
      if (isNode) {
        projectApiPath = 'http://127.0.0.1:' + port + projectApiPath;
      }

      await axios.post(projectApiPath, {
        id: projectId,
        basepath: info.basePath,
        token
      })
    }

    for (let index = 0; index < res.length; index++) {
      let item = res[index];
      let data = Object.assign(item, {
        project_id: projectId,
        catid: selectCatid
      });
      if (basePath) {
        data.path =
          data.path.indexOf(basePath) === 0 ? data.path.substr(basePath.length) : data.path;
      }
      if (
        data.catname &&
        cats[data.catname] &&
        typeof cats[data.catname] === 'object' &&
        cats[data.catname].id
      ) {
        data.catid = cats[data.catname].id;
      }
      data.token = token;

      if (dataSync !== 'normal') {
        // 开启同步功能
        count++;
        let apipath = '/api/interface/save';
        if (isNode) {
          apipath = 'http://127.0.0.1:' + port + apipath;
        }
        data.dataSync = dataSync;
        let result = await axios.post(apipath, data);
        if (result.data.errcode) {
          successNum--;
          callback({showLoading: false});
          messageError(result.data.errmsg);
        } else {
          existNum = existNum + result.data.data.length;
        }
      } else {
        // 未开启同步功能
        count++;
        let apipath = '/api/interface/add';
        if (isNode) {
          apipath = 'http://127.0.0.1:' + port + apipath;
        }
        let result = await axios.post(apipath, data);
        if (result.data.errcode) {
          successNum--;
          if (result.data.errcode == 40022) {
            existNum++;
          }
          if (result.data.errcode == 40033) {
            callback({showLoading: false});
            messageError('没有权限');
            break;
          }
        }
      }

      if (count === len) {
        callback({showLoading: false});
        //删除接口,2s后执行删除接口
        setTimeout(async () => {
          let delRes = await yapi.getInst(interfaceModel).delUnUsed(projectId, upTime);
          let delNum = delRes.n;
          let data = {
            projectId: projectId,
            type: 'project',
            uid: 11,
            username: '自动同步用户',
            typeid: selectCatid,
            addTime: new Date().getTime(),
            content: `删除接口${delNum}个`
          };
          await yapi.getInst(logModel).save(data);
        }, 2000);
        messageSuccess(`成功导入接口 ${successNum} 个, 已存在的接口 ${existNum} 个`);
        return;
      }

      taskNotice(index, res.length)
    }
  };

  return await handleAddInterface(res);
}

module.exports = handle;
