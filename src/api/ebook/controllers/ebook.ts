

'use strict';

/**
 *  ebook controller
 */

import { factories } from '@strapi/strapi';
import fetch from 'node-fetch';
import * as YAML from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

// 定义 host 变量
let host: string = "http://127.0.0.1:1337";

// 定义 bookid 变量
let bookid: number = 1;
// 定义文件列表
let filelist: string[] = [];
// 获取父目录路径
const father: string = path.resolve(__dirname, '../../../../');
// 定义书籍路径
let bookpath: string = path.resolve(father, '../tmp');
// 定义书籍文档路径
let bookdocpath: string = path.resolve(bookpath, 'docs');

// 解析导航函数
function parse_nav(n: any): void {
    const val = Object.values(n)[0];

    // 如果是文件名
    if (typeof val === 'string') {
        console.log(val);
        filelist.push(val);
    } else if (Array.isArray(val)) {
        // 二级子目录，需要再次循环
        val.forEach((item: any) => {
            parse_nav(item);
        });
    }
}

// 创建文件内容函数
async function make_filecontent(filename: string): Promise<void> {
    const file_parse = path.parse(filename);

    const res = await fetch(`${host}/api/file-mds?filters[filename][$eq]=${filename}&filters[ebook][id][$eq]=${bookid}`);
    const datas = await res.json();

    if (datas.meta.pagination.total === 0) return;

    let content = datas.data[0].content;

    let filepath = path.resolve(bookdocpath, file_parse.dir);
    console.log(filepath);

    // 如果目录不存在创建目录，支持创建多级目录
    if (!fs.existsSync(filepath)) {
        fs.mkdirSync(filepath, { recursive: true });
    }

    fs.writeFileSync(path.resolve(filepath, file_parse.base), content, { flag: "w+" });
}

// 书籍更新函数
async function bookupdate(ctx: any): Promise<void> {
    // 读取书的信息
    const res = await fetch(`${host}/api/ebooks`);
    let datas = await res.json();
    let objdata: any = "";

    bookid = Number(ctx.query.bookid);
    for (let i = 0; i < datas.data.length; i++) {
        const data = datas.data[i];
        if (data.id === bookid) {
            objdata = data;
            break;
        }
    }
    if (objdata === "") return;

    const buffer = objdata.yml;
    const name = objdata.name;
    const folder = objdata.folder;

    let config = YAML.parse(buffer);
    const nav = config['nav'];

    if (folder !== "" && folder != null) {
        bookpath = path.resolve(father, `../${folder}`);
        bookdocpath = path.resolve(bookpath, 'docs');
    }

    // 创建 mkdocs 项目配置文件
    // 第一次创建准备环境
    if (!fs.existsSync(bookpath)) {
        fs.mkdirSync(bookpath, { recursive: true });
        fs.mkdirSync(bookdocpath, { recursive: true });
        exec(`cd ${bookpath};git init`, (err, stdout, stderr) => {
            if (err) {
                console.error(err);
            }
        });
        // git 忽略每次的 site 文件，因为每次生成都会产生新的 site，导致 git 仓库非常大
        fs.writeFileSync(path.resolve(bookpath, '.gitignore'), "site/", { flag: "w+" });
    }
    fs.writeFileSync(path.resolve(bookpath, 'mkdocs.yml'), buffer, { flag: "w+" });

    // 每一次调用重新初始化列表
    filelist = [];
    nav.forEach((item: any) => {
        parse_nav(item);
    });

    // 创建所有的 markdown 文件
    console.log("---------------------------");
    for (const item of filelist) {
        await make_filecontent(item);
    }

    exec(`cd ${bookpath};mkdocs build`, (err, stdout, stderr) => {
        if (err) {
            console.error(err);
        }
        console.log("stdout:", stdout);
        console.log("stderr:", stderr);
        // 保存
        const tt = new Date();
        exec(`cd ${bookpath};git add *;git commit -m 'modify ${tt.toDateString()}'`, (err, stdout, stderr) => {
            console.log("stdout:", stdout);
            console.log("stderr:", stderr);
        });
    });
}


module.exports = factories.createCoreController('api::ebook.ebook', ({ strapi }) => ({
    // Method 1: Creating an entirely custom action
    async booksync(ctx: any): Promise<string> {
        await bookupdate(ctx);

        return `<html><body>更新 完成，等待2秒自动返回</body><script>
                  setTimeout(function(){history.back();}, 2000);
                </script></html>`;
    }
}));
    
