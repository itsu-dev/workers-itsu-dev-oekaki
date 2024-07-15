const handleImages = async (request: Request, env: { [key: string]: any }): Promise<Response> => {
  const { DB } = env;
  const images = await DB
    .prepare('SELECT * FROM Images ORDER BY created_at desc LIMIT 50')
    .all();

  if (images.error) {
    return Response.json({
      success: false,
      reason: 'internal server error',
    }, {
      status: 500,
      headers: {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  return Response.json({
    success: true,
    images: images.results,
  }, {
    status: 200,
    headers: {
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};

const handleHistories = async (request: Request, env: { [key: string]: any }): Promise<Response> => {
  const { DB } = env;
  const { searchParams } = new URL(request.url);

  if (!searchParams.has('image_id')) {
    return Response.json({
      success: false,
      reason: 'required params are not set',
    }, {
      status: 400,
      headers: {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const histories = await DB
    .prepare('SELECT * FROM Histories WHERE image_id = ? ORDER BY created_at asc')
    .bind(searchParams.get('image_id'))
    .all();

  if (histories.error) {
    return Response.json({
      success: false,
      reason: 'internal server error',
    }, {
      status: 500,
      headers: {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (histories.results.length === 0) {
    return Response.json({
      success: false,
      reason: 'no such image_id',
    }, {
      status: 404,
      headers: {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  return Response.json({
    success: true,
    result: histories.results,
  }, {
    status: 200,
    headers: {
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};

const handlePost = async (request: Request, env: { [key: string]: any }): Promise<Response> => {
  // POST でなければ蹴る
  if (request.method !== 'POST') {
    return Response.json({
      success: false,
      reason: 'method not allowed',
    }, {
      status: 405,
      headers: {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const { DB } = env;

  type PostRequest = {
    id?: string;
    payload: number[];
    description?: string;
    author?: string;
    _bs: string;
  }

  const json = await request.json<PostRequest>();

  // 入力値チェック
  if (json == null
    || json._bs == null
    || (json.description != null && json.description.length > 20)
    || json.payload[0] !== 0x23
    || json.payload[1] !== 0x52
    || json.payload[2] !== 0xff
    || json.payload[3] !== 0xac) {
    return Response.json({
      success: false,
      reason: 'bad request',
    }, {
      status: 400,
      headers: {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // author フィールドがなければ名無しとし、存在して20文字以上なら蹴る
  const author = json.author == null ? '名無し' : json.author;
  if (author.length > 20) {
    return Response.json({
      success: false,
      reason: 'bad request',
    }, {
      status: 400,
      headers: {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // id フィールドが存在すれば Image レコードがあるかどうか見る
  let alreadyExists = false;
  let imageId = json.id;
  let oldDeleteHash: string | null = null;
  let oldCount: number | null = null;

  if (imageId != null) {
    const existingImage = await DB
      .prepare('SELECT * FROM Images WHERE id = ?')
      .bind(imageId)
      .first();

    // エラーなら蹴る
    if (existingImage.error) {
      return Response.json({
        success: false,
        reason: 'internal server error',
      }, {
        status: 500,
        headers: {
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // すでに Image レコードが存在していれば存在フラグを立て、描画回数を見る
    if (existingImage) {
      alreadyExists = true;
      oldDeleteHash = existingImage.deleteHash;
      oldCount = existingImage.count;

      // 描画回数が 10 回を超えていたら蹴る
      if (oldCount! >= 10) {
        return Response.json({
          success: false,
          reason: 'this image is already completed',
        }, { status: 423 });
      }

      // なければ不正な値なので蹴る
    } else {
      return Response.json({
        success: false,
        reason: 'invalid image id',
      }, {
        status: 400,
        headers: {
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }
  }

  const imgurResponse = await fetch('https://api.imgur.com/3/image', {
    method: 'POST',
    headers: {
      Authorization: `Client-ID 24e4dd9a2c2c44b`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image: json._bs.replace(/^data:image\/(png|jpeg);base64,/, ""),
    }),
  });

  if (!imgurResponse.ok) {
    return Response.json({
      success: false,
      reason: 'bad request',
    }, {
      status: 500,
      headers: {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const result = await imgurResponse.json();
  // @ts-ignore
  const imgurId = result.data.id;
  // @ts-ignore
  const deleteHash = result.data.deletehash;


  // Image レコードがなければ新たに作成する
  if (!alreadyExists) {
    imageId = crypto.randomUUID();

    const insertedImage = await DB
      .prepare('INSERT INTO Images (id, author, ip, description, imgurId, count, deleteHash, created_at ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(imageId, author, request.headers.get('CF-Connecting-IP'), json.description, imgurId, 1, deleteHash, new Date().getTime())
      .run();

    // エラーなら蹴る
    if (insertedImage.error) {
      return Response.json({
        success: false,
        reason: 'internal server error',
      }, {
        status: 500,
        headers: {
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

  } else {
    const deleteResponse = await fetch(`https://api.imgur.com/3/image/${oldDeleteHash}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Client-ID 24e4dd9a2c2c44b`,
      }
    });

    if (!deleteResponse.ok) {
      return Response.json({
        success: false,
        reason: 'internal server error',
      }, {
        status: 500,
        headers: {
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // すでに存在していれば imgurId を更新する
    const updatedImage = await DB
      .prepare('UPDATE Images SET imgurId = ?, created_at = ?, count = ? WHERE id = ?')
      .bind(imgurId, new Date().getTime(), oldCount! + 1, imageId)
      .run();

    // エラーなら蹴る
    if (updatedImage.error) {
      return Response.json({
        success: false,
        reason: 'internal server error',
      }, {
        status: 500,
        headers: {
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }
  }

  const rollBack = async () => {
    await DB
      .prepare('DELETE From Images WHERE id = ?')
      .bind(imageId)
      .run();

    await DB
      .prepare('DELETE From Histories WHERE image_id = ?')
      .bind(imageId)
      .run();
  }

  // 描画履歴をつくる
  const insertedHistory = await DB
    .prepare('INSERT INTO Histories (id, author, ip, image_id, created_at ) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), author, request.headers.get('CF-Connecting-IP'), imageId, new Date().getTime())
    .run();

  // エラーなら蹴る
  if (insertedHistory.error) {
    // 作成した Image レコードを削除する
    if (!alreadyExists) {
      await rollBack();
    }

    return Response.json({
      success: false,
      reason: 'internal server error',
    }, {
      status: 500,
      headers: {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const { BUCKET } = env;

  // 画像データを保存する
  try {
    const body = new Uint8Array(json.payload.slice(4));
    const r2Object = await BUCKET.put(`${imageId}.bin`, body, {
      httpMetadata: { contentType: 'application/octet-stream' },
    });

    if (r2Object == null) {
      await rollBack();

      return Response.json({
        success: false,
        reason: 'internal server error',
      }, {
        status: 500,
        headers: {
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }
  } catch (e: unknown) {
    await rollBack();

    return Response.json({
      success: false,
      reason: 'internal server error',
    }, {
      status: 500,
      headers: {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  return Response.json({
    success: true,
    result: imageId,
  }, {
    status: 200,
    headers: {
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};

const handleImage = async (request: Request, env: { [key: string]: any }): Promise<Response> => {
  const { DB } = env;
  const { searchParams } = new URL(request.url);

  if (!searchParams.has('image_id')) {
    return Response.json({
      success: false,
      reason: 'required params are not set',
    }, {
      status: 400,
      headers: {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const image = await DB
    .prepare('SELECT * FROM Images WHERE id = ?')
    .bind(searchParams.get('image_id'))
    .first();

  if (image.error) {
    return Response.json({
      success: false,
      reason: 'internal server error',
    }, {
      status: 500,
      headers: {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (image == null) {
    return Response.json({
      success: false,
      reason: 'no such image_id',
    }, {
      status: 404,
      headers: {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const { BUCKET } = env;

  // 画像データを取得する
  let type = 'bin';
  let object = await BUCKET.get(`${searchParams.get('image_id')}.bin`);
  if (object == null) {
    type = 'jpg';
    object = [];
  }

  delete image.deleteHash;

  return Response.json({
    success: true,
    result: {
      payload: Array.from(new Uint8Array(await object.arrayBuffer())),
      ...image, type
    }
  }, {
    status: 200,
    headers: {
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};

export default {
  async fetch(request: Request, env: { [key: string]: any }) {
    const { pathname } = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    switch (pathname) {
      case '/api/oekaki/images':
        return await handleImages(request, env);
      case '/api/oekaki/histories':
        return await handleHistories(request, env);
      case '/api/oekaki/post':
        return await handlePost(request, env);
      case '/api/oekaki/image':
        return await handleImage(request, env);
      default:
        return Response.json({
          success: false,
          reason: 'access denied',
        }, { status: 403 });
    }
  },
};

