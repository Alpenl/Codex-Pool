import 'axios'

declare module 'axios' {
    export interface AxiosInstance {
        request<T = unknown, R = T, D = unknown>(config: AxiosRequestConfig<D>): Promise<R>;
        get<T = unknown, R = T, D = unknown>(url: string, config?: AxiosRequestConfig<D>): Promise<R>;
        delete<T = unknown, R = T, D = unknown>(url: string, config?: AxiosRequestConfig<D>): Promise<R>;
        head<T = unknown, R = T, D = unknown>(url: string, config?: AxiosRequestConfig<D>): Promise<R>;
        options<T = unknown, R = T, D = unknown>(url: string, config?: AxiosRequestConfig<D>): Promise<R>;
        post<T = unknown, R = T, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<R>;
        put<T = unknown, R = T, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<R>;
        patch<T = unknown, R = T, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<R>;
    }
}
