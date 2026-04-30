import {
  resetInterceptors,
  startAxios,
} from '../../features/network/networkInterceptor';
import { _resetNetworkForTesting, createNetworkFeature } from '../../features/network';

function createFakeAxios() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let requestInterceptor: ((config: any) => any) | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let responseInterceptor: ((response: any) => any) | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let errorInterceptor: ((error: any) => any) | undefined;

  const ejectRequest = jest.fn();
  const ejectResponse = jest.fn();

  return {
    interceptors: {
      request: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        use(onFulfilled?: (config: any) => any) {
          requestInterceptor = onFulfilled;
          return 1;
        },
        eject: ejectRequest,
      },
      response: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        use(onFulfilled?: (response: any) => any, onRejected?: (error: any) => any) {
          responseInterceptor = onFulfilled;
          errorInterceptor = onRejected;
          return 2;
        },
        eject: ejectResponse,
      },
    },
    simulateRequest(config: Record<string, unknown>) {
      return requestInterceptor!(config);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    simulateResponse(response: any) {
      return responseInterceptor!(response);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    simulateError(error: any) {
      return errorInterceptor!(error);
    },
    ejectRequest,
    ejectResponse,
  };
}

describe('networkInterceptor axios setup', () => {
  afterEach(() => {
    resetInterceptors();
  });

  it('captures axios requests and responses', () => {
    const emit = jest.fn();
    const fakeAxios = createFakeAxios();

    startAxios(fakeAxios as any, emit);

    const config = fakeAxios.simulateRequest({
      method: 'post',
      url: 'https://api.example.com/users',
      headers: { 'Content-Type': 'application/json' },
      data: { name: 'test' },
    });

    fakeAxios.simulateResponse({
      status: 201,
      statusText: 'Created',
      headers: { 'content-type': 'application/json' },
      data: { id: 1, name: 'test' },
      config,
    });

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toMatchObject({
      request: {
        url: 'https://api.example.com/users',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { name: 'test' },
      },
      response: {
        status: 201,
        statusText: 'Created',
        data: { id: 1, name: 'test' },
        success: true,
      },
    });
  });

  it('captures axios errors with response', async () => {
    const emit = jest.fn();
    const fakeAxios = createFakeAxios();

    startAxios(fakeAxios as any, emit);

    const config = fakeAxios.simulateRequest({
      method: 'get',
      url: 'https://api.example.com/not-found',
    });

    await expect(
      fakeAxios.simulateError({
        message: 'Request failed with status code 404',
        config,
        response: {
          status: 404,
          statusText: 'Not Found',
          data: { error: 'Not found' },
        },
      }),
    ).rejects.toBeDefined();

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toMatchObject({
      request: {
        url: 'https://api.example.com/not-found',
        method: 'GET',
      },
      response: {
        status: 404,
        statusText: 'Not Found',
        data: { error: 'Not found' },
        success: false,
      },
      error: 'Request failed with status code 404',
    });
  });

  it('captures axios network errors without response', async () => {
    const emit = jest.fn();
    const fakeAxios = createFakeAxios();

    startAxios(fakeAxios as any, emit);

    const config = fakeAxios.simulateRequest({
      method: 'get',
      url: 'https://api.example.com/timeout',
    });

    await expect(
      fakeAxios.simulateError({
        message: 'Network Error',
        config,
      }),
    ).rejects.toBeDefined();

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toMatchObject({
      request: {
        url: 'https://api.example.com/timeout',
        method: 'GET',
      },
      response: undefined,
      error: 'Network Error',
    });
  });

  it('combines baseURL with url', () => {
    const emit = jest.fn();
    const fakeAxios = createFakeAxios();

    startAxios(fakeAxios as any, emit);

    const config = fakeAxios.simulateRequest({
      method: 'get',
      baseURL: 'https://api.example.com',
      url: '/users',
    });

    fakeAxios.simulateResponse({
      status: 200,
      statusText: 'OK',
      data: [],
      config,
    });

    expect(emit.mock.calls[0][0].request.url).toBe(
      'https://api.example.com/users',
    );
  });

  it('ejects interceptors on stop', () => {
    const emit = jest.fn();
    const fakeAxios = createFakeAxios();

    const stop = startAxios(fakeAxios as any, emit);
    stop();

    expect(fakeAxios.ejectRequest).toHaveBeenCalledWith(1);
    expect(fakeAxios.ejectResponse).toHaveBeenCalledWith(2);
  });
});

describe('NetworkFeature axios integration', () => {
  afterEach(() => {
    _resetNetworkForTesting();
  });

  it('intercepts axios when axiosInstance is provided', () => {
    const fakeAxios = createFakeAxios();
    const feature = createNetworkFeature({
      axiosInstance: fakeAxios as any,
    });
    feature.setup();

    const config = fakeAxios.simulateRequest({
      method: 'get',
      url: 'https://api.example.com/data',
    });

    fakeAxios.simulateResponse({
      status: 200,
      statusText: 'OK',
      data: { result: true },
      config,
    });

    expect(feature.getSnapshot()).toHaveLength(1);
    expect(feature.getSnapshot()[0]).toMatchObject({
      request: {
        url: 'https://api.example.com/data',
        method: 'GET',
      },
      response: {
        status: 200,
        data: { result: true },
        success: true,
      },
    });

    feature.cleanup();
  });

  it('does not intercept axios when axiosInstance is not provided', () => {
    const feature = createNetworkFeature();
    feature.setup();

    expect(feature.getSnapshot()).toHaveLength(0);

    feature.cleanup();
  });

  it('cleans up axios interceptors on cleanup', () => {
    const fakeAxios = createFakeAxios();
    const feature = createNetworkFeature({
      axiosInstance: fakeAxios as any,
    });
    feature.setup();
    feature.cleanup();

    expect(fakeAxios.ejectRequest).toHaveBeenCalledWith(1);
    expect(fakeAxios.ejectResponse).toHaveBeenCalledWith(2);
  });
});
